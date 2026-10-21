---
'@tenphi/tasty': patch
---

A custom property name written out as CSS keeps its case: `padding: 'var(--myGap)'` emits `var(--myGap)` instead of `var(--mygap)`, which named a different property. `$myGap` already kept its case.
