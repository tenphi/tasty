---
'@tenphi/tasty': patch
---

Fix cascade order corruption in `mergeEntriesByValue` (style rendering Stage 1b). When a style map contained two non-default states with the same value separated by a state with a different value (e.g. `{ hovered: 'red', pressed: 'blue', disabled: 'red' }`), the early merge would lift the lower-priority entry up to the maximum priority of the group, producing an `:is([data-disabled], [data-hovered])` rule that shadowed `pressed` whenever `[data-hovered]` was set — so `pressed + hovered` together resolved to red instead of blue. Same-value entries are now only merged when the merge is provably safe (no intermediate-priority state could have won in a scenario the merge would block), restoring the authored cascade while preserving the existing dark/high-contrast token deduplication optimization.
