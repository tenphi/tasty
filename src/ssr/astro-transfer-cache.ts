/**
 * Internal module-level state for the Astro middleware transfer-cache flag.
 *
 * Set by `tastyIntegration` and read by `astro-middleware.ts`. Kept in a
 * separate non-exported module so it does not appear on the public API
 * surface of `@tenphi/tasty/ssr/astro`.
 */

let _middlewareTransferCache = true;

/** @internal */
export function setMiddlewareTransferCache(value: boolean): void {
  _middlewareTransferCache = value;
}

/** @internal */
export function getMiddlewareTransferCache(): boolean {
  return _middlewareTransferCache;
}
