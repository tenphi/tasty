---
'@tenphi/tasty': patch
---

`inject()` without a `cacheKey` reuses the class when the same rules are injected again, as it does for a repeated `cacheKey`. It used to write every rule a second time and reset the class's pin count to 1, so disposing one caller's handle could let `gc()` delete rules another caller still held.
