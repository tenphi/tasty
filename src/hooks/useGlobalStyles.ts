import { getConfig } from '../config';
import { injectGlobal } from '../injector';
import type { StyleResult } from '../pipeline';
import { renderStyles } from '../pipeline';
import { getRSCCache, isRSCEnvironment, pushRSCCSS } from '../rsc-cache';
import { collectAutoInferredProperties } from '../ssr/collect-auto-properties';
import { formatGlobalRules } from '../ssr/format-global-rules';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';
import type { Styles } from '../styles/types';
import { resolveRecipes } from '../utils/resolve-recipes';

interface UseGlobalStylesOptions {
  /**
   * Stable identifier for update tracking. When provided, changing the styles
   * will dispose the previous injection and inject the new one.
   * Without an id, the selector is used as the slot key.
   */
  id?: string;
}

/**
 * Inject global styles for a given selector.
 * Useful for styling elements by selector without generating classNames.
 *
 * SSR-aware: when a ServerStyleCollector is available, CSS is collected
 * during the render phase instead of being injected into the DOM.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
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

  const resolvedStyles = resolveRecipes(styles);

  const styleResults = renderStyles(resolvedStyles, selector) as StyleResult[];

  if (styleResults.length === 0) return;

  const ssrCollector = getRegisteredSSRCollector();

  if (ssrCollector) {
    ssrCollector.collectInternals();

    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = `global:${selector}:${css.length}:${css.slice(0, 64)}`;
      ssrCollector.collectGlobalStyles(key, css);
    }

    if (getConfig().autoPropertyTypes !== false) {
      collectAutoInferredProperties(styleResults, ssrCollector, resolvedStyles);
    }
    return;
  }

  if (isRSCEnvironment()) {
    const rscCache = getRSCCache();
    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = options?.id
        ? `__global:${options.id}`
        : `__global:${selector}:${css.length}:${css.slice(0, 64)}`;
      pushRSCCSS(rscCache, key, css);
    }
    return;
  }

  // Client path
  const slotKey = options?.id ?? selector;
  const stylesKey = JSON.stringify(resolvedStyles);

  const existing = clientGlobalEntries.get(slotKey);
  if (existing) {
    if (existing.stylesKey === stylesKey) return;
    existing.dispose();
  }

  const { dispose } = injectGlobal(styleResults);
  clientGlobalEntries.set(slotKey, { stylesKey, dispose });
}

interface ClientGlobalEntry {
  stylesKey: string;
  dispose: () => void;
}

const clientGlobalEntries = new Map<string, ClientGlobalEntry>();
