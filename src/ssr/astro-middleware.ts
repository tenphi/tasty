/**
 * Astro middleware entrypoint for `tastyIntegration()`.
 *
 * Registered via `addMiddleware()` as `@tenphi/tasty/ssr/astro-middleware`.
 * Exposed as a package subpath only so Astro can resolve it — use
 * `tastyMiddleware()` directly if you need manual middleware composition.
 *
 * This is the islands variant: the rendered class list is transferred to the
 * client so hydrating islands skip the style pipeline. See
 * `./astro-middleware-static` for the variant used by
 * `tastyIntegration({ islands: false })`.
 */

import { tastyMiddleware } from './astro';

export const onRequest = tastyMiddleware({ transferCache: true });
