---
'@tenphi/tasty': patch
---

Optimize CSS selectors: merge OR branches into `:is()`/`:not()` groups for `@root`, `@own`, and base modifier/pseudo conditions; sort conditions for canonical output; unify `ParentGroup` with `SelectorGroup`.
