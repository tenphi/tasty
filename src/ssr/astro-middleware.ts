/**
 * Astro middleware entrypoint for tastyIntegration().
 *
 * Referenced by the integration via addMiddleware(). Not intended
 * as a public package export — use tastyMiddleware() directly if
 * you need manual middleware composition.
 *
 * The transferCache setting is controlled by setMiddlewareTransferCache(),
 * called by tastyIntegration() before middleware is loaded.
 */

import { getMiddlewareTransferCache, tastyMiddleware } from './astro';

export const onRequest = tastyMiddleware({
  get transferCache() {
    return getMiddlewareTransferCache();
  },
});
