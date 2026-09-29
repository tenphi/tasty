---
'@tenphi/tasty': patch
---

Parse single-letter modifier and class names in state keys (`x` → `[data-x]`, `.x`), matching the `data-x` attribute `mods={{ x: true }}` renders. They used to be skipped, turning a key like `{ '': A, x: B }` into one that always applies. State keys Tasty cannot fully read — unknown characters, an operator missing a state, or two states with no operator between them — now emit an `INVALID_STATE_KEY` warning.
