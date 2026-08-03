import { getGlobalInjector } from '../config';

/**
 * Build a per-(injector, root) client state cache for the standalone style
 * functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useCounterStyle`).
 *
 * Two levels, both weak:
 *
 * - **injector** — `configure()` replaces the global injector, and every dispose
 *   handle and generated name we cache belongs to the one that produced it.
 *   Keying by injector makes stale state fall away with it, instead of letting
 *   change-detection keys suppress re-injection into the new sheets.
 * - **root** — the same selector or slot name can be used in several shadow
 *   roots, and each holds its own injection.
 */
export function createClientState<T extends object>(
  create: () => T,
): (root: Document | ShadowRoot) => T {
  const byInjector = new WeakMap<object, WeakMap<Document | ShadowRoot, T>>();

  return (root: Document | ShadowRoot): T => {
    const injector = getGlobalInjector() as unknown as object;

    let byRoot = byInjector.get(injector);
    if (!byRoot) {
      byRoot = new WeakMap();
      byInjector.set(injector, byRoot);
    }

    let state = byRoot.get(root);
    if (!state) {
      state = create();
      byRoot.set(root, state);
    }

    return state;
  };
}
