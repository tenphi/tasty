---
'@tenphi/tasty': patch
---

Simplify scrollbar style handler to use standard CSS properties only (`scrollbar-width`, `scrollbar-color`, `scrollbar-gutter`), removing all `::-webkit-scrollbar-*` pseudo-element logic and the `styled` modifier.
