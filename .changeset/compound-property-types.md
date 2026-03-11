---
'@tenphi/tasty': patch
---

Upgrade auto-inferred `@property` types: length and percentage values now register as `<length-percentage>` instead of separate `<length>`/`<percentage>`, enabling smooth transitions between mixed units. Add name-based inference for `--*-line-height` properties as `<number> | <length-percentage>`.
