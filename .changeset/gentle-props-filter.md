---
'@tenphi/tasty': patch
---

Make `filterBaseProps` generic so callers can pass strongly-typed props without casting; return `Partial<T>` to preserve value types.
