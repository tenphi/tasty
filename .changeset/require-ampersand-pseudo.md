---
'@tenphi/tasty': minor
---

Pseudo-element and pseudo-class patterns in the `$` selector affix now require an explicit `&` prefix to attach to the root selector. `$: '::before'` must be written as `$: '&::before'`. Without `&`, pseudo patterns are treated as descendant selectors.
