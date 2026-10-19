import { getConfig, getGlobalInjector, getGlobalKeyframes } from '../config';
import { injectGlobal } from '../injector';
import type { KeyframesSteps } from '../injector/types';
import { resolveSelectorKeyframes } from '../keyframes';
import type { StyleResult } from '../pipeline';
import { renderStyles } from '../pipeline';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import {
  collectAutoInferredProperties,
  collectAutoInferredPropertiesRSC,
} from '../ssr/collect-auto-properties';
import { formatGlobalRules } from '../ssr/format-global-rules';
import { formatKeyframesCSS } from '../ssr/format-keyframes';
import type { Styles } from '../styles/types';
import { createClientState } from '../utils/client-state';
import { hashString } from '../utils/hash';
import { resolveRecipes } from '../utils/resolve-recipes';

interface UseGlobalStylesOptions {
  /**
   * Stable identifier for update tracking (client-only). When provided,
   * changing the styles will dispose the previous injection and inject the
   * new one. Without an id, the selector is used as the slot key.
   * In RSC mode, renders are single-pass so update tracking does not apply.
   */
  id?: string;
  /** Shadow root or document to inject into (client only). */
  root?: Document | ShadowRoot;
}

interface ClientGlobalEntry {
  stylesKey: string;
  dispose: () => void;
}

const getClientGlobalSlots = /* @__PURE__ */ createClientState(
  () => new Map<string, ClientGlobalEntry>(),
);

const noop = () => {
  /* nothing to dispose */
};

/**
 * Inject global styles for a given selector.
 * Useful for styling elements by selector without generating classNames.
 *
 * SSR-aware: when a ServerStyleCollector is available, CSS is collected
 * during the render phase instead of being injected into the DOM.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * Injected styles are permanent — they are not cleaned up on component unmount.
 * Use the `id` option for update tracking when styles change over the
 * component lifecycle.
 *
 * Update tracking is per-slot and per-root: a slot (`id`, or the selector when
 * no `id` is given) holds exactly one injection per `root`. Changing the styles
 * replaces it; rendering styles that produce no CSS clears it.
 *
 * @param selector - CSS selector to apply styles to (e.g., '.my-class', ':root', 'body')
 * @param styles - Tasty styles object
 * @param options - Optional settings including `id` for update tracking
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useGlobalStyles('.card', {
 *     padding: '2x',
 *     radius: '1r',
 *     fill: '#white',
 *   });
 *
 *   return <div className="card">Content</div>;
 * }
 * ```
 */
export function useGlobalStyles(
  selector: string,
  styles?: Styles,
  options?: UseGlobalStylesOptions,
): void {
  if (!styles) return;

  if (!selector) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[Tasty] useGlobalStyles: selector is required and cannot be empty. ' +
          'Styles will not be injected.',
      );
    }
    return;
  }

  const target = getStyleTarget();

  // Resolve the client slot once — both the fast path below and the injection
  // at the end need it.
  const slots =
    target.mode === 'client'
      ? getClientGlobalSlots(options?.root ?? document)
      : null;
  const slotKey = options?.id ?? selector;
  const stylesKey = slots ? JSON.stringify(styles) : '';
  const existing = slots?.get(slotKey);

  // Client fast path: skip resolveRecipes/renderStyles if styles haven't changed
  if (existing && existing.stylesKey === stylesKey) return;

  const resolvedStyles = resolveRecipes(styles);

  const rendered = renderStyles(resolvedStyles, selector) as StyleResult[];

  if (rendered.length === 0) {
    // An update that renders no CSS must still clear the slot's previous
    // injection, otherwise the stale rules keep applying to the selector.
    if (slots) {
      existing?.dispose();
      slots.set(slotKey, { stylesKey, dispose: noop });
    }
    return;
  }

  // Animated rules name keyframes that have to exist: emit them under the
  // resolved names the class path uses, and point the rules at those names.
  const { rules: styleResults, keyframes } = resolveSelectorKeyframes(
    resolvedStyles,
    rendered,
    getGlobalKeyframes(),
  );

  if (target.mode === 'ssr') {
    target.collector.collectInternals();

    if (keyframes) {
      for (const [name, steps] of keyframes) {
        target.collector.collectKeyframes(
          name,
          formatKeyframesCSS(name, steps),
        );
      }
    }

    const css = formatGlobalRules(styleResults);
    if (css) {
      // A slot key (explicit `id`) replaces, matching client update tracking;
      // content-hashed keys only dedup.
      const key = options?.id
        ? `global:${options.id}`
        : `global:${selector}:${hashString(css)}`;
      target.collector.collectGlobalStyles(key, css, options?.id != null);
    }

    if (getConfig().autoPropertyTypes !== false) {
      collectAutoInferredProperties(
        styleResults,
        target.collector,
        resolvedStyles,
      );
    }
    return;
  }

  if (target.mode === 'rsc') {
    if (keyframes) {
      for (const [name, steps] of keyframes) {
        pushRSCCSS(
          target.cache,
          `__kf:${name}`,
          formatKeyframesCSS(name, steps),
        );
      }
    }

    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = options?.id
        ? `__global:${options.id}`
        : `__global:${selector}:${hashString(css)}`;
      pushRSCCSS(target.cache, key, css, options?.id != null);
    }

    if (getConfig().autoPropertyTypes !== false) {
      collectAutoInferredPropertiesRSC(
        styleResults,
        target.cache,
        resolvedStyles,
      );
    }
    return;
  }

  // Client path
  if (slots) {
    // Keyframes are referenced before the previous injection is released, so
    // ones that survive the update are not deleted and re-inserted.
    const releaseKeyframes = holdKeyframes(keyframes, options?.root);

    existing?.dispose();

    const { dispose } = injectGlobal(styleResults, { root: options?.root });
    slots.set(slotKey, {
      stylesKey,
      dispose: () => {
        dispose();
        releaseKeyframes();
      },
    });
  }
}

/**
 * Take a reference on each keyframes rule under its resolved name, which the
 * rules were rewritten to. Shares the entries the class path holds, so neither
 * side deletes a rule the other still animates.
 */
function holdKeyframes(
  keyframes: Map<string, KeyframesSteps> | null,
  root?: Document | ShadowRoot,
): () => void {
  if (!keyframes) return noop;

  const injector = getGlobalInjector();
  const disposers = [...keyframes].map(
    ([name, steps]) =>
      injector.keyframes(steps, { name, root, distinctByName: true }).dispose,
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
