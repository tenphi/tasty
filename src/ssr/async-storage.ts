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
 * This module imports from 'node:async_hooks', which a browser bundle stubs
 * out. Nothing reads the import until a collector is looked up, and a stub
 * reads as "no storage", so `@tenphi/tasty/ssr` can still be imported there
 * (for `hydrateTastyClasses()`) without breaking rendering.
 */

import * as asyncHooks from 'node:async_hooks';
import type { AsyncLocalStorage } from 'node:async_hooks';

import type { ServerStyleCollector } from './collector';

const ALS_KEY = '__tasty_ssr_als__';

type Storage = AsyncLocalStorage<ServerStyleCollector>;

/** The `AsyncLocalStorage` class, or null where the module is stubbed out. */
function getStorageClass(): typeof AsyncLocalStorage | null {
  try {
    const Storage = asyncHooks.AsyncLocalStorage;
    return typeof Storage === 'function' ? Storage : null;
  } catch {
    // Some development stubs throw on any property access.
    return null;
  }
}

/**
 * Whether this environment has `AsyncLocalStorage` — a server runtime rather
 * than a browser bundle.
 */
export function isAsyncStorageAvailable(): boolean {
  return getStorageClass() !== null;
}

function getSharedStorage(): Storage | null {
  const g = globalThis as Record<string, unknown>;
  if (!g[ALS_KEY]) {
    const StorageClass = getStorageClass();
    if (!StorageClass) return null;
    g[ALS_KEY] = new StorageClass<ServerStyleCollector>();
  }
  return g[ALS_KEY] as Storage;
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
  const storage = getSharedStorage();
  if (!storage) {
    throw new Error(
      '[Tasty] runWithCollector() needs AsyncLocalStorage from node:async_hooks, which this environment does not provide. Call it on the server.',
    );
  }
  return storage.run(collector, fn);
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
