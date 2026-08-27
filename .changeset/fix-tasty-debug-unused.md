---
'@tenphi/tasty': patch
---

Fix `tastyDebug` reporting zero unused classes. `summary()`, `cache()` and `css('unused')` derived "unused" from ref counts the render path stopped maintaining, so they always came up empty and silently dropped every injected-but-detached class from the totals. Unused is now the set `gc()` would collect: injected classes that no element carries.
