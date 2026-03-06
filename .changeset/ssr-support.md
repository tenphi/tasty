---
'@tenphi/tasty': minor
---

Add server-side rendering (SSR) support with zero-cost client hydration. New entry points: `@tenphi/tasty/ssr`, `@tenphi/tasty/ssr/next`, `@tenphi/tasty/ssr/astro`. Next.js App Router (`TastyRegistry`), Astro (`tastyMiddleware`), and generic framework integration via `ServerStyleCollector`, `TastySSRContext`, `runWithCollector`, and `hydrateTastyCache`. Requires React 19+.
