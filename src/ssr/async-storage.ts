/**
 * AsyncLocalStorage integration for SSR collector discovery.
 *
 * Used by Astro middleware and generic framework integrations where
 * the library cannot wrap the React tree with a context provider.
 * The middleware calls runWithCollector() around the render, and
 * useStyles() calls getSSRCollector() to find it.
 *
 * This module imports from 'node:async_hooks' — it must be excluded
 * from client bundles via the build configuration.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { ServerStyleCollector } from './collector';

const tastySSRStorage = new AsyncLocalStorage<ServerStyleCollector>();

/**
 * Run a function with a ServerStyleCollector bound to the current
 * async context. All useStyles() calls within `fn` (and any async
 * continuations) will find this collector via getSSRCollector().
 */
export function runWithCollector<T>(
  collector: ServerStyleCollector,
  fn: () => T,
): T {
  return tastySSRStorage.run(collector, fn);
}

/**
 * Retrieve the ServerStyleCollector bound to the current async context.
 * Returns null when called outside of runWithCollector() or on the client.
 */
export function getSSRCollector(): ServerStyleCollector | null {
  if (typeof tastySSRStorage?.getStore !== 'function') return null;
  return tastySSRStorage.getStore() ?? null;
}
