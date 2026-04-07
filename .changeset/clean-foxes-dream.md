---
'@tenphi/tasty': patch
---

Fix cross-call-site cache collisions in `useKeyframes`, `useCounterStyle`, and `useRawCSS` factory overloads. Reduce memory usage in `useRawCSS` content dedup. Eliminate redundant serialization in `useGlobalStyles`. DRY up auto-property inference for SSR/RSC.
