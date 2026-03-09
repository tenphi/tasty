---
'@tenphi/tasty': patch
---

Fix `@property` type inference for bare zero values. A value of `0` is ambiguous in CSS (could be `<length>`, `<angle>`, `<percentage>`, etc.), so it is no longer inferred as `<number>`. This prevents incorrect `@property` registrations that would reject subsequent typed values like `10px`.
