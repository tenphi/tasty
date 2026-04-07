---
'@tenphi/tasty': patch
---

Extract `getStyleTarget()` helper to DRY up SSR/RSC/client detection across all style functions. Unify RSC dedup keys for keyframes and counter-styles between standalone hooks and `computeStyles`. Add deps-based factory caching to `useKeyframes` and `useRawCSS`. Remove unused factory overload from `useCounterStyle`. Fix SSR `id` handling in `useGlobalStyles` and `useRawCSS`.
