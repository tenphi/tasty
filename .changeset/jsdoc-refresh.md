---
'@tenphi/tasty': patch
---

Correct stale JSDoc in the published type declarations: units are literal (`2x` → `16px`, `2r` → `12px`) rather than `calc(… var(--gap))`, the `units` example no longer redefines native `em`/`vw`, `tastyDebug.help()` shows a hash-based class name, and `getCSSText()` is documented as needing a DOM rather than being "for SSR".
