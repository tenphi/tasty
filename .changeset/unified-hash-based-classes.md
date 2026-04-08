---
'@tenphi/tasty': major
---

Unified hash-based class names across RSC, SSR, and client. Same cache key now produces the same class name in all environments, enabling cross-environment style deduplication. Replaces the heavy SSRCacheState transfer with a lightweight class-name-list via `window.__TASTY__`.

**SSR/RSC fixes included:**
- Fix missing tokens on pages without RSC-rendered tasty components. The `globalThis.__tasty_rsc_internals_emitted__` flag leaked across requests in the same Node.js process; internals (tokens, `@property`, `@font-face`, `@counter-style`) are now emitted exclusively by the SSR collector.
- Fix duplicate global CSS when RSC and SSR paths both emit internals in Next.js App Router. The SSR collector now skips internals already emitted by the RSC inline-style path.
- Fix CSS class name collisions during client-side navigation in Next.js App Router. RSC inline styles used sequential counters (`r0`, `r1`, …) that reset on every request; replaced with content-based hashing (djb2) so identical content always maps to the same name.
- Auto-skip global CSS injection on client when `<style data-tasty-ssr>` is detected, eliminating the need for `typeof window === 'undefined'` guards in `configure()` calls.

**Internal SSR API changes (not part of the public API):**
- `SSRCacheState` type removed — replaced by plain `string[]` class lists.
- `ServerStyleCollector.getCacheState()` replaced by `getRenderedClassNames()`.
- `window.__TASTY_SSR_CACHE__` replaced by `window.__TASTY__`.
- `hydrateTastyCache()` deprecated in favor of `hydrateTastyClasses()` (the old function still works as a compat shim).
- Class name format changed from `t{number}` to `t{base36hash}`.
