---
'@tenphi/tasty': patch
---

`outline` with no color is now drawn in the text color until your tokens define `#outline`. It used to emit `var(--outline-color)` with no fallback, so `outline: true` drew nothing unless the app defined `#outline`. Tasty also registers `#outline` by default (`initial-value: currentcolor`), so a style that sets `#outline` locally no longer turns every other outline transparent at runtime. `radius: 'leaf'` / `'backleaf'` now render their sharp corners in zero-runtime CSS too: `var(--sharp-radius)` falls back to `0` where the default `$sharp-radius` property is not emitted.
