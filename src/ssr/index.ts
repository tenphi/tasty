/**
 * SSR entry point for @tenphi/tasty.
 *
 * Provides the core SSR infrastructure: ServerStyleCollector,
 * AsyncLocalStorage integration, and cache hydration.
 *
 * Import from '@tenphi/tasty/ssr'.
 */

// Core collector
export { ServerStyleCollector, createServerStyleCollector } from './collector';

// AsyncLocalStorage integration for Astro / generic frameworks
export { runWithCollector, getSSRCollector } from './async-storage';

// Client-side cache hydration
export { hydrateTastyClasses } from './hydrate';

// Register the ALS getter so hooks can find the collector
// without importing 'node:async_hooks' in the browser bundle.
// Uses globalThis so the getter is visible across separate module graphs.
import { getSSRCollector } from './async-storage';
import { registerSSRCollectorGetterGlobal } from './ssr-collector-ref';

registerSSRCollectorGetterGlobal(getSSRCollector);
