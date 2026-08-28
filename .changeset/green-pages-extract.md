---
'@tenphi/tasty': minor
---

Extract common Astro CSS as the base cascade and each page's remaining Tasty
CSS into a content-hashed override stylesheet. Extracted links now also respect
Astro's `build.assetsPrefix` configuration, and builds reject page-relative CSS
URLs whose meaning would change after extraction.
