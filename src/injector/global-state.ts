import type { StyleInjector } from './injector';
import { HYDRATED_RULE_INDEX } from './types';

const GLOBAL_INJECTOR_KEY = '__TASTY_GLOBAL_INJECTOR__';

interface TastyGlobalStorage {
  [GLOBAL_INJECTOR_KEY]?: StyleInjector;
  __TASTY__?: string[];
}

function getStorage(): TastyGlobalStorage {
  return (
    typeof window !== 'undefined' ? window : globalThis
  ) as TastyGlobalStorage;
}

function registerHydratedClasses(
  injector: StyleInjector,
  classes: string[],
): void {
  if (typeof document === 'undefined') return;

  const registry = injector._sheetManager.getRegistry(document);
  for (const className of classes) {
    if (registry.rules.has(className)) continue;

    registry.rules.set(className, {
      className,
      ruleIndex: HYDRATED_RULE_INDEX,
      sheetIndex: HYDRATED_RULE_INDEX,
    });
    registry.pinCounts.set(className, 0);
  }
}

/** Register now when the runtime exists, otherwise defer until it initializes. */
export function hydrateStoredGlobalInjector(classes: string[]): void {
  const storage = getStorage();
  const injector = storage[GLOBAL_INJECTOR_KEY];

  if (injector) {
    registerHydratedClasses(injector, classes);
    return;
  }

  // `window.__TASTY__` is also what the runtime injector reads lazily. Keep an
  // explicit list there until configuration creates the global injector.
  if (storage.__TASTY__ === classes) return;
  if (storage.__TASTY__) {
    storage.__TASTY__.push(...classes);
  } else {
    storage.__TASTY__ = [...classes];
  }
}
