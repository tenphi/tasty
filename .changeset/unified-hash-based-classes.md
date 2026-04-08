---
'@tenphi/tasty': minor
---

Unified hash-based class names across RSC, SSR, and client. Same cache key now produces the same class name in all environments, enabling cross-environment style deduplication. Replaces the heavy SSRCacheState transfer with a lightweight class-name-list via `window.__TASTY__`.
