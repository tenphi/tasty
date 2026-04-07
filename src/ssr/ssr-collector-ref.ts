/**
 * Global reference to the SSR collector getter function.
 *
 * This indirection avoids importing 'node:async_hooks' in the browser bundle.
 * The SSR entry point sets this ref when loaded on the server. The useStyles
 * hook calls it if set; on the client it stays null and is never called.
 *
 * Uses a module-level variable as the primary mechanism. In Next.js App
 * Router the RSC and SSR module graphs load separate copies of this module,
 * so the getter registered by TastyRegistry (SSR layer) is invisible to
 * server components (RSC layer) — which correctly fall through to inline
 * RSC styles.
 *
 * A globalThis fallback (`registerSSRCollectorGetterGlobal`) is provided
 * for frameworks like Astro where middleware and page components live in
 * different module graphs and must share the getter across them.
 */

import type { ServerStyleCollector } from './collector';

type SSRCollectorGetter = () => ServerStyleCollector | null;

const GETTER_KEY = '__tasty_ssr_collector_getter__';

let _getSSRCollector: SSRCollectorGetter | null = null;

/**
 * Register the collector getter in the current module graph only.
 * Used by Next.js TastyRegistry.
 */
export function registerSSRCollectorGetter(fn: SSRCollectorGetter): void {
  _getSSRCollector = fn;
}

/**
 * Register the collector getter on globalThis so it is visible across
 * separate module graphs (e.g. Astro middleware ↔ page components).
 */
export function registerSSRCollectorGetterGlobal(fn: SSRCollectorGetter): void {
  (globalThis as Record<string, unknown>)[GETTER_KEY] = fn;
}

/**
 * Retrieve the SSR collector: module-level first, globalThis fallback.
 */
export function getRegisteredSSRCollector(): ServerStyleCollector | null {
  if (_getSSRCollector) return _getSSRCollector();
  const getter = (globalThis as Record<string, unknown>)[GETTER_KEY] as
    | SSRCollectorGetter
    | undefined;
  return getter ? getter() : null;
}
