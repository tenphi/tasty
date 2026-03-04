/**
 * Global reference to the SSR collector getter function.
 *
 * This indirection avoids importing 'node:async_hooks' in the browser bundle.
 * The SSR entry point sets this ref when loaded on the server. The useStyles
 * hook calls it if set; on the client it stays null and is never called.
 */

import type { ServerStyleCollector } from './collector';

type SSRCollectorGetter = () => ServerStyleCollector | null;

let _getSSRCollector: SSRCollectorGetter | null = null;

export function registerSSRCollectorGetter(fn: SSRCollectorGetter): void {
  _getSSRCollector = fn;
}

export function getRegisteredSSRCollector(): ServerStyleCollector | null {
  return _getSSRCollector ? _getSSRCollector() : null;
}
