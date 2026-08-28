---
'@tenphi/tasty': patch
---

Fix `tastyDebug` reporting zero unused classes. `summary()`, `cache()` and `css('unused')` derived "unused" from counters the render path stopped maintaining, so they always came up empty and silently dropped every injected-but-detached class from the totals — a page holding hundreds of stale rules printed `Unused: 0 classes`. Unused is now the set `gc()` would collect, read from the injector rather than recomputed, so the two cannot drift apart again.

The summary's totals are also the real totals now: raw CSS is read from the sheet it lives in and counted by the rules the engine parsed rather than by counting braces, and `@font-face`, `@counter-style` and `@function` are included. `css('all')` includes raw CSS, as it was already documented to.
