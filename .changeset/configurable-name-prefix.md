---
'@tenphi/tasty': minor
---

Add `namePrefix` option to control the prefix used for every generated identifier (class names, keyframe names, counter-style names). Defaults to `'t'` for the runtime/SSR/RSC paths and `'ts'` for the zero-runtime build path so static-extracted classes can never collide with runtime classes when both are loaded on the same page. Keyframes and counter-styles now consistently use single-letter discriminators (`${prefix}k…`, `${prefix}c…`) so the three name kinds stay visually distinct in devtools (e.g. `tk1a2b3` for a keyframe). Generated keyframe and counter-style names that previously matched `^k\d+$` / `^cs\d+$` are now `^tk\d+$` / `^tc\d+$` by default; class names continue to start with `t…`.
