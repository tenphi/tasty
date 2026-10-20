---
'@tenphi/tasty': minor
---

`mergeStyles()` and the `Styles` type are now exported from `@tenphi/tasty/zero`. Node build code can merge per-component overrides into source styles, with the same rules as `tasty(Base, { styles })`, without loading React.
