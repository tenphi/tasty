/**
 * Client-side cache hydration for SSR/RSC.
 *
 * Pre-populates the client injector's rules map with class names
 * rendered on the server. With hash-based naming, the client derives
 * the same class name from the same cache key, so only the class name
 * list needs to cross the wire — no cache keys or counters.
 */

import { getGlobalInjector } from '../config';
import { HYDRATED_RULE_INDEX } from '../injector/types';

/**
 * Pre-populate the client-side style registry from the server's class name list.
 *
 * Call this before ReactDOM.hydrateRoot() or ensure it runs before
 * any tasty() component renders on the client.
 *
 * When called without arguments, reads the class list from `window.__TASTY__`
 * (populated by inline scripts emitted during SSR/RSC streaming).
 */
export function hydrateTastyClasses(classes?: string[]): void {
  if (typeof document === 'undefined') return;

  if (!classes) {
    classes = typeof window !== 'undefined' ? window.__TASTY__ : undefined;
  }

  if (!classes?.length) return;

  const injector = getGlobalInjector();
  const registry = injector._sheetManager.getRegistry(document);

  for (const cls of classes) {
    if (!registry.rules.has(cls)) {
      registry.rules.set(cls, {
        className: cls,
        ruleIndex: HYDRATED_RULE_INDEX,
        sheetIndex: HYDRATED_RULE_INDEX,
      });
      registry.refCounts.set(cls, 0);
    }
  }
}

/**
 * @deprecated Use `hydrateTastyClasses()` instead. This alias exists
 * for backwards compatibility and will be removed in a future major version.
 */
export function hydrateTastyCache(state?: {
  entries?: Record<string, string>;
}): void {
  if (state?.entries) {
    hydrateTastyClasses(Object.values(state.entries));
  } else {
    hydrateTastyClasses();
  }
}
