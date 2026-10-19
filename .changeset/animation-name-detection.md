---
'@tenphi/tasty': patch
---

Fix two ways an `animation` could silently fail to run:

- **camelCase names were lowercased.** The style parser folds values to lowercase, so `animation: 'fadeIn 1s'` emitted `fadein`, which matched neither `@keyframes fadeIn` nor the hashed name of a local `@keyframes`. `animation` and `animationName` now keep each name's authored case; durations, timing functions and keywords are still parsed as before.
- **A name after `steps(n, end)` was missed.** Name detection split the value at every comma and picked `end` (or `start`) out of the timing function, so in `'1s steps(4, end) spin'` the local `@keyframes spin` was never emitted or renamed. Lists now split at top-level commas only, and function arguments are never read as names.
