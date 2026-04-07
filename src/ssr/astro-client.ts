/**
 * Client-side cache hydration for Astro islands.
 *
 * Reads the SSR cache state from <script data-tasty-cache> and
 * pre-populates the injector so island hydration skips the style
 * pipeline entirely.
 *
 * This module is browser-safe — it does NOT import node:async_hooks.
 *
 * Usage:
 * - Automatically injected by tastyIntegration() via injectScript('before-hydration')
 * - Can be imported manually: `import '@tenphi/tasty/ssr/astro-client'`
 */

import { hydrateTastyCache } from './hydrate';

if (typeof window !== 'undefined') {
  const script = document.querySelector('script[data-tasty-cache]');
  if (script) {
    try {
      const state = JSON.parse(script.textContent!);
      hydrateTastyCache(state);
    } catch {
      // Ignore malformed cache state
    }
  }
}
