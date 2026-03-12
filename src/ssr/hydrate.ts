/**
 * Client-side cache hydration for SSR.
 *
 * Pre-populates the client injector's cacheKeyToClassName map from the
 * server's serialized state. This ensures that useStyles() returns
 * cache hits during hydration, skipping the entire rendering pipeline.
 */

import { getGlobalInjector } from '../config';
import type { SSRCacheState } from './collector';

declare global {
  interface Window {
    __TASTY_SSR_CACHE__?: SSRCacheState;
  }
}

/**
 * Pre-populate the client-side style cache from the server's SSR state.
 *
 * Call this before ReactDOM.hydrateRoot() or ensure it runs before
 * any tasty() component renders on the client.
 *
 * When called without arguments, reads state from:
 * 1. `window.__TASTY_SSR_CACHE__` (streaming — populated by inline scripts)
 * 2. `<script data-tasty-cache>` (non-streaming — JSON payload)
 */
export function hydrateTastyCache(state?: SSRCacheState): void {
  if (typeof document === 'undefined') return;

  if (!state) {
    state =
      (typeof window !== 'undefined' ? window.__TASTY_SSR_CACHE__ : null) ??
      undefined;
    if (!state) {
      const script = document.querySelector('script[data-tasty-cache]');
      if (script) {
        try {
          state = JSON.parse(script.textContent!) as SSRCacheState;
        } catch {
          return;
        }
      }
    }
  }

  if (!state) return;

  const injector = getGlobalInjector();
  const registry = injector._sheetManager.getRegistry(document);

  registry.classCounter = Math.max(registry.classCounter, state.classCounter);

  for (const [cacheKey, className] of Object.entries(state.entries)) {
    registry.cacheKeyToClassName.set(cacheKey, className);
    registry.rules.set(className, {
      className,
      ruleIndex: -2,
      sheetIndex: -2,
    });
    registry.refCounts.set(className, 0);
  }
}
