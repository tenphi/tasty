/**
 * Client-side cache hydration for SSR/RSC.
 *
 * Registers class names rendered on the server with the client injector. If
 * the runtime is not initialized yet, registration is deferred until its first
 * use. With hash-based naming, only the class name list needs to cross the
 * wire — no cache keys or counters.
 */

import { hydrateStoredGlobalInjector } from '../injector/global-state';

/**
 * Hydrate the client-side style registry from the server's class name list.
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

  hydrateStoredGlobalInjector(classes);
}
