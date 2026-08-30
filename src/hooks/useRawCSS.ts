import { injectRawCSS } from '../injector';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import { createClientState } from '../utils/client-state';
import { depsEqual } from '../utils/deps-equal';
import { hashString } from '../utils/hash';

interface UseRawCSSOptions {
  /**
   * Shadow root or document to inject into. Update tracking is per-root: the
   * same id in two roots holds a separate injection in each.
   */
  root?: Document | ShadowRoot;
  /**
   * Stable identifier for update tracking (client-only). When provided,
   * changing the CSS content will dispose the previous injection and inject
   * the new one. Without an id, deduplication is purely content-based (same
   * CSS is injected only once). In RSC mode, renders are single-pass so
   * update tracking does not apply.
   */
  id?: string;
}

interface ClientEntry {
  contentKey: string;
  dispose: () => void;
}

interface ClientRawCSSState {
  /** id -> the single injection that slot currently owns */
  entries: Map<string, ClientEntry>;
  /** content hashes injected without an id (permanent, deduped) */
  contentDedup: Set<string>;
  /** id -> last factory deps, to skip re-evaluating the factory */
  factoryDeps: Map<string, readonly unknown[]>;
}

const getClientState = createClientState((): ClientRawCSSState => ({
  entries: new Map(),
  contentDedup: new Set(),
  factoryDeps: new Map(),
}));

// Overload 1: Static CSS string
export function useRawCSS(css: string, options?: UseRawCSSOptions): void;

// Overload 2: Factory function with dependencies
export function useRawCSS(
  factory: () => string,
  deps: readonly unknown[],
  options?: UseRawCSSOptions,
): void;

/**
 * Inject raw CSS text directly without parsing.
 * This is a low-overhead alternative for injecting global CSS that doesn't need tasty processing.
 *
 * The CSS is inserted into a separate style element (data-tasty-raw) to avoid conflicts
 * with tasty's chunked style sheets.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * Injected styles are permanent — they are not cleaned up on component unmount.
 * Use the `id` option for update tracking when styles change over the
 * component lifecycle.
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
export function useRawCSS(
  cssOrFactory: string | (() => string),
  depsOrOptions?: readonly unknown[] | UseRawCSSOptions,
  options?: UseRawCSSOptions,
): void {
  const isFactory = typeof cssOrFactory === 'function';

  const deps =
    isFactory && Array.isArray(depsOrOptions) ? depsOrOptions : undefined;
  const opts = isFactory
    ? options
    : (depsOrOptions as UseRawCSSOptions | undefined);

  const target = getStyleTarget();

  const state =
    target.mode === 'client' ? getClientState(opts?.root ?? document) : null;

  // Client deps cache: skip factory re-evaluation when deps haven't changed
  if (isFactory && deps && opts?.id && state) {
    const cachedDeps = state.factoryDeps.get(opts.id);
    if (cachedDeps && depsEqual(cachedDeps, deps)) {
      return;
    }
  }

  const css = isFactory
    ? (cssOrFactory as () => string)()
    : (cssOrFactory as string);

  if (!css.trim()) return;

  if (target.mode === 'ssr') {
    // A slot key (explicit `id`) replaces, matching client update tracking;
    // content-hashed keys only dedup.
    const key = opts?.id ? `raw:${opts.id}` : `raw:${hashString(css)}`;
    target.collector.collectRawCSS(key, css, opts?.id != null, {
      source: 'global',
    });
    return;
  }

  if (target.mode === 'rsc') {
    const key = opts?.id ? `__raw:${opts.id}` : `__raw:${hashString(css)}`;
    pushRSCCSS(target.cache, key, css, opts?.id != null);
    return;
  }

  // Client path
  if (!state) return;

  const id = opts?.id;

  if (id) {
    const existing = state.entries.get(id);
    if (existing) {
      if (existing.contentKey === css) return;
      existing.dispose();
    }

    const { dispose } = injectRawCSS(css, opts);
    state.entries.set(id, { contentKey: css, dispose });
    if (deps) state.factoryDeps.set(id, deps);
  } else {
    const contentKey = hashString(css);
    if (state.contentDedup.has(contentKey)) return;
    state.contentDedup.add(contentKey);
    injectRawCSS(css, opts);
  }
}
