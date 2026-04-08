---
'@tenphi/tasty': minor
---

Unified hash-based class names across RSC, SSR, and client. Same cache key now produces the same class name in all environments, enabling cross-environment style deduplication. Replaces the heavy SSRCacheState transfer with a lightweight class-name-list via `window.__TASTY__`.

**Internal SSR API changes (not part of the public API):**
- `SSRCacheState` type removed — replaced by plain `string[]` class lists.
- `ServerStyleCollector.getCacheState()` replaced by `getRenderedClassNames()`.
- `window.__TASTY_SSR_CACHE__` replaced by `window.__TASTY__`.
- `hydrateTastyCache()` deprecated in favor of `hydrateTastyClasses()` (the old function still works as a compat shim).
- Class name format changed from `t{number}` to `t{base36hash}`.
