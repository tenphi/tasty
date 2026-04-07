---
'@tenphi/tasty': minor
---

Add Astro Integration API (`tastyIntegration()`) with three-tier support: zero-setup for static pages, optimized static without client JS (`islands: false`), and full island hydration (default). Split client hydration into `@tenphi/tasty/ssr/astro-client`. Middleware now uses streaming `TransformStream` instead of buffering the full response.
