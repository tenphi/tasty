---
'@tenphi/tasty': patch
---

Fix `tastyDebug` reporting zero unused classes. `summary()`, `cache()` and `css('unused')` derived "unused" from counters the render path stopped maintaining, so they always came up empty and silently dropped every injected-but-detached class from the totals — a page holding hundreds of stale rules printed `Unused: 0 classes`. Unused is now the set `gc()` would collect, read from the injector rather than recomputed, so the two cannot drift apart again.
