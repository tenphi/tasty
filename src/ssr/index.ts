/**
 * SSR entry point for @tenphi/tasty.
 *
 * Provides the core SSR infrastructure: ServerStyleCollector,
 * React context, AsyncLocalStorage integration, and cache hydration.
 *
 * Import from '@tenphi/tasty/ssr'.
 */

// Core collector
export { ServerStyleCollector } from './collector';
export type { SSRCacheState } from './collector';

// React context for Next.js streaming
export { TastySSRContext } from './context';

// AsyncLocalStorage integration for Astro / generic frameworks
export { runWithCollector, getSSRCollector } from './async-storage';

// Client-side cache hydration
export { hydrateTastyCache } from './hydrate';

// Register the ALS getter so useStyles can find the collector
// without importing 'node:async_hooks' in the browser bundle.
import { getSSRCollector } from './async-storage';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

registerSSRCollectorGetter(getSSRCollector);
