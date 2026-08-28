---
'@tenphi/tasty': patch
---

Fix `tastyDebug` reporting zero unused classes. `summary()`, `cache()` and `css('unused')` derived "unused" from counters the render path stopped maintaining, so they always came up empty and silently dropped every injected-but-detached class from the totals — a page holding hundreds of stale rules printed `Unused: 0 classes`. Unused is now the set `gc()` would collect, read from the injector rather than recomputed, so the two cannot drift apart again.

The summary's totals are also the real totals now: raw CSS is read from the sheet it lives in and counted by the rules the engine parsed rather than by counting braces, and `@font-face`, `@counter-style` and `@function` are included. `css('all')` includes raw CSS, as it was already documented to — spliced in at the position the DOM gives its sheet, so two rules of equal specificity are reported with the winner the page actually applies. Reads that reach into the registry rather than through an injector API land the pending writes first, so a report taken inside a batch window no longer describes it as empty.

Bundle limit: babel-plugin 49.35 -> 49.6 kB.
