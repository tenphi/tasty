import { injectRawCSS } from '../injector';
import { getRSCCache, isRSCEnvironment, pushRSCCSS } from '../rsc-cache';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseRawCSSOptions {
  root?: Document | ShadowRoot;
  /**
   * Stable identifier for update tracking. When provided, changing the CSS
   * content will dispose the previous injection and inject the new one.
   * Without an id, deduplication is purely content-based (same CSS is
   * injected only once).
   */
  id?: string;
}

/**
 * Inject raw CSS text directly without parsing.
 * This is a low-overhead alternative for injecting global CSS that doesn't need tasty processing.
 *
 * The CSS is inserted into a separate style element (data-tasty-raw) to avoid conflicts
 * with tasty's chunked style sheets.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * @example Static CSS string
 * ```tsx
 * function GlobalStyles() {
 *   useRawCSS(`
 *     body {
 *       margin: 0;
 *       padding: 0;
 *       font-family: sans-serif;
 *     }
 *   `);
 *
 *   return null;
 * }
 * ```
 *
 * @example Factory function with dependencies
 * ```tsx
 * function ThemeStyles({ theme }: { theme: 'light' | 'dark' }) {
 *   useRawCSS(() => `
 *     :root {
 *       --bg-color: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
 *       --text-color: ${theme === 'dark' ? '#ffffff' : '#1a1a1a'};
 *     }
 *   `, [theme], { id: 'theme-vars' });
 *
 *   return null;
 * }
 * ```
 *
 * @example With options
 * ```tsx
 * function ShadowStyles({ shadowRoot }) {
 *   useRawCSS(() => `.scoped { color: red; }`, [], { root: shadowRoot });
 *   return null;
 * }
 * ```
 */

interface ClientEntry {
  contentKey: string;
  dispose: () => void;
}

const clientEntries = new Map<string, ClientEntry>();
const clientContentDedup = new Set<string>();

// Overload 1: Static CSS string
export function useRawCSS(css: string, options?: UseRawCSSOptions): void;

// Overload 2: Factory function with dependencies
export function useRawCSS(
  factory: () => string,
  deps: readonly unknown[],
  options?: UseRawCSSOptions,
): void;

// Implementation
export function useRawCSS(
  cssOrFactory: string | (() => string),
  depsOrOptions?: readonly unknown[] | UseRawCSSOptions,
  options?: UseRawCSSOptions,
): void {
  const isFactory = typeof cssOrFactory === 'function';

  const opts = isFactory
    ? options
    : (depsOrOptions as UseRawCSSOptions | undefined);

  const css = isFactory
    ? (cssOrFactory as () => string)()
    : (cssOrFactory as string);

  if (!css.trim()) return;

  const ssrCollector = getRegisteredSSRCollector();

  if (ssrCollector) {
    const key = `raw:${css.length}:${css.slice(0, 64)}`;
    ssrCollector.collectRawCSS(key, css);
    return;
  }

  if (isRSCEnvironment()) {
    const rscCache = getRSCCache();
    const key = opts?.id
      ? `__raw:${opts.id}`
      : `__raw:${css.length}:${css.slice(0, 64)}`;
    pushRSCCSS(rscCache, key, css);
    return;
  }

  // Client path
  const id = opts?.id;

  if (id) {
    const existing = clientEntries.get(id);
    if (existing) {
      if (existing.contentKey === css) return;
      existing.dispose();
    }

    const { dispose } = injectRawCSS(css, opts);
    clientEntries.set(id, { contentKey: css, dispose });
  } else {
    if (clientContentDedup.has(css)) return;
    clientContentDedup.add(css);
    injectRawCSS(css, opts);
  }
}
