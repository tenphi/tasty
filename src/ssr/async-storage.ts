/**
 * AsyncLocalStorage integration for SSR collector discovery.
 *
 * Used by Astro middleware and generic framework integrations where
 * the library cannot wrap the React tree with a context provider.
 * The middleware calls runWithCollector() around the render, and
 * useStyles() calls getSSRCollector() to find it.
 *
 * Uses globalThis to ensure the AsyncLocalStorage instance is shared
 * across module instances — frameworks like Astro may load middleware
 * and page components from separate module graphs.
 *
 * This module imports from 'node:async_hooks' — it must be excluded
 * from client bundles via the build configuration.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ServerStyleCollector } from './collector';

const ALS_KEY = '__tasty_ssr_als__';

function getSharedStorage(): AsyncLocalStorage<ServerStyleCollector> {
  const g = globalThis as Record<string, unknown>;
  if (!g[ALS_KEY]) {
    g[ALS_KEY] = new AsyncLocalStorage<ServerStyleCollector>();
  }
  return g[ALS_KEY] as AsyncLocalStorage<ServerStyleCollector>;
}

/**
 * Run a function with a ServerStyleCollector bound to the current
 * async context. All useStyles() calls within `fn` (and any async
 * continuations) will find this collector via getSSRCollector().
 */
export function runWithCollector<T>(
  collector: ServerStyleCollector,
  fn: () => T,
): T {
  return getSharedStorage().run(collector, fn);
}

/**
 * Retrieve the ServerStyleCollector bound to the current async context.
 * Returns null when called outside of runWithCollector() or on the client.
 */
export function getSSRCollector(): ServerStyleCollector | null {
  const storage = getSharedStorage();
  if (typeof storage?.getStore !== 'function') return null;
  return storage.getStore() ?? null;
}
