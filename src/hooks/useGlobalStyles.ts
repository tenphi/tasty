import { getConfig } from '../config';
import { injectGlobal } from '../injector';
import type { StyleResult } from '../pipeline';
import { renderStyles } from '../pipeline';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import {
  collectAutoInferredProperties,
  collectAutoInferredPropertiesRSC,
} from '../ssr/collect-auto-properties';
import { formatGlobalRules } from '../ssr/format-global-rules';
import type { Styles } from '../styles/types';
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

const clientGlobalEntries = new Map<string, ClientGlobalEntry>();

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

  // Client fast path: skip resolveRecipes/renderStyles if styles haven't changed
  if (target.mode === 'client') {
    const slotKey = options?.id ?? selector;
    const stylesKey = JSON.stringify(styles);
    const existing = clientGlobalEntries.get(slotKey);
    if (existing && existing.stylesKey === stylesKey) return;
  }

  const resolvedStyles = resolveRecipes(styles);

  const styleResults = renderStyles(resolvedStyles, selector) as StyleResult[];

  if (styleResults.length === 0) return;

  if (target.mode === 'ssr') {
    target.collector.collectInternals();

    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = options?.id
        ? `global:${options.id}`
        : `global:${selector}:${hashString(css)}`;
      target.collector.collectGlobalStyles(key, css);
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
    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = options?.id
        ? `__global:${options.id}`
        : `__global:${selector}:${hashString(css)}`;
      pushRSCCSS(target.cache, key, css);
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
  const slotKey = options?.id ?? selector;

  const existing = clientGlobalEntries.get(slotKey);
  if (existing) {
    existing.dispose();
  }

  const { dispose } = injectGlobal(styleResults, { root: options?.root });
  clientGlobalEntries.set(slotKey, {
    stylesKey: JSON.stringify(styles),
    dispose,
  });
}
