---
'@tenphi/tasty': patch
---

Relax `filterBaseProps` generic constraint from `Record<string, unknown>` to `object` so composed prop types (built from `Omit`/intersections) are accepted without requiring a string index signature.
