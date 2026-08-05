/**
 * Astro middleware entrypoint for `tastyIntegration({ islands: false })`.
 *
 * Registered via `addMiddleware()` as
 * `@tenphi/tasty/ssr/astro-middleware-static`. Exposed as a package subpath
 * only so Astro can resolve it — use `tastyMiddleware({ transferCache: false })`
 * directly if you need manual middleware composition.
 *
 * Identical to `./astro-middleware` except that no class-list `<script>` is
 * emitted, so a site without `client:*` islands ships zero client JavaScript.
 */

import { tastyMiddleware } from './astro';

export const onRequest = tastyMiddleware({ transferCache: false });
