---
'@tenphi/tasty': patch
---

Stop logging "Browser rejected CSS rule" warnings in development. These rejections (e.g. unsupported vendor pseudo-elements like `::-moz-selection` in Blink) are a normal part of cross-engine CSS and were flooding the console and test output. The rules are still skipped safely.
