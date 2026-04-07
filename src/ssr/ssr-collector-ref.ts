/**
 * Global reference to the SSR collector getter function.
 *
 * This indirection avoids importing 'node:async_hooks' in the browser bundle.
 * The SSR entry point sets this ref when loaded on the server. The useStyles
 * hook calls it if set; on the client it stays null and is never called.
 *
 * Uses globalThis to ensure the getter is shared across module instances —
 * frameworks like Astro may load middleware and page components from
 * separate module graphs, creating duplicate module-level state.
 */

import type { ServerStyleCollector } from './collector';

type SSRCollectorGetter = () => ServerStyleCollector | null;

const GETTER_KEY = '__tasty_ssr_collector_getter__';

export function registerSSRCollectorGetter(fn: SSRCollectorGetter): void {
  (globalThis as Record<string, unknown>)[GETTER_KEY] = fn;
}

export function getRegisteredSSRCollector(): ServerStyleCollector | null {
  const getter = (globalThis as Record<string, unknown>)[GETTER_KEY] as
    | SSRCollectorGetter
    | undefined;
  return getter ? getter() : null;
}
