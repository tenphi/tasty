---
'@tenphi/tasty': patch
---

Fix sub-element `$` selector affix for bare HTML tag names: `$: "h1"` now produces `{root} h1` instead of `{root} h1 [data-element="..."]`. Add support for the `*` universal selector in affix patterns.
