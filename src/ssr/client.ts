/**
 * Browser-safe SSR hydration for any framework.
 *
 * `@tenphi/tasty/ssr` also carries the server collector and its
 * `AsyncLocalStorage` integration; this entry is only the client half, with no
 * import side effects. Call `hydrateTastyClasses()` before `hydrateRoot()`.
 * (`@tenphi/tasty/ssr/astro-client` runs the same call on import.)
 *
 * @example
 * ```tsx
 * import { hydrateTastyClasses } from '@tenphi/tasty/ssr/client';
 *
 * hydrateTastyClasses();
 * hydrateRoot(document.getElementById('root')!, <App />);
 * ```
 */

export { hydrateTastyClasses } from './hydrate';
