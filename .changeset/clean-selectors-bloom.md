---
'@tenphi/tasty': patch
---

Optimize OR selector generation: remove redundant `:not()` inside `:is()` groups and eliminate redundant boolean attribute selectors when a valued selector for the same attribute is present.
