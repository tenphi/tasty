/**
 * Client-side cache hydration for Astro islands.
 *
 * Reads the class name list from `window.__TASTY__` (populated by
 * inline scripts emitted during SSR) and pre-populates the injector
 * so island hydration skips the style pipeline entirely.
 *
 * This module is browser-safe — it does NOT import node:async_hooks.
 *
 * Usage:
 * - Automatically injected by tastyIntegration() via injectScript('before-hydration')
 * - Can be imported manually: `import '@tenphi/tasty/ssr/astro-client'`
 */

import { hydrateTastyClasses } from './hydrate';

if (typeof window !== 'undefined') {
  hydrateTastyClasses();
}
