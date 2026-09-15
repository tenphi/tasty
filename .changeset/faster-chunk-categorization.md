---
'@tenphi/tasty': minor
---

Speed up style chunk categorization and reduce its runtime footprint.

**Removed:** the `dotize` export is no longer available from `@tenphi/tasty` or
`@tenphi/tasty/core`. It was undocumented, had no internal callers, and was not
part of the styling API. If you imported it, copy the helper into your own code.
