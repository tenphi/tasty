---
'@tenphi/tasty': patch
---

`outline` with no color is now drawn in the text color until your tokens define `#outline`. Tasty registers `#outline` by default (`initial-value: currentcolor`), as it does `#border`; before, `outline: true` or `outline: '2px dashed'` drew nothing unless the app defined the token. A style that sets `#outline` locally also no longer turns every other outline transparent in runtime or zero-runtime CSS.
