---
'@tenphi/tasty': patch
---

Fix `tastyIntegration()` failing every Astro build in 3.0.0.

The integration registered its middleware with `new URL('./astro-middleware.js', import.meta.url)`. That URL is resolved against the emitted chunk, and the v3 build hoists `tastyIntegration` out of `dist/ssr/astro.js` into a shared chunk at the `dist/` root — so it pointed at `dist/astro-middleware.js`, which does not exist, while the real file shipped at `dist/ssr/astro-middleware.js`. Astro now receives a package subpath instead, which is resolved through the `exports` map and cannot be invalidated by chunk layout.

This also fixes `tastyIntegration({ islands: false })` silently keeping the class-list transfer script. The flag was passed through module-level state written by the integration at config-load time and read by the middleware at request time — different module instances, and different processes entirely for built output, so the middleware always saw the `true` default. Each variant now bakes its own setting in.

Adds two entry points, `@tenphi/tasty/ssr/astro-middleware` and `@tenphi/tasty/ssr/astro-middleware-static`. They exist so Astro can resolve the middleware by specifier and are not meant to be imported directly — use `tastyMiddleware()` for manual middleware composition.

Anyone who worked around this with a manual `src/middleware.ts` can revert to `tastyIntegration()` once on this release, or keep the manual setup — both are supported.
