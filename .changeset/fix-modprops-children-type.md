---
'@tenphi/tasty': patch
---

Fix type error where JSX elements were not assignable as children of tasty components due to `ResolveModProps` producing a catch-all index signature and `AllHTMLAttributes` intersection narrowing tag-specific attribute types.
