---
'@tenphi/tasty': minor
---

Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, correctly preserving OR branches as separate selector variants and unifying their internal representation as modifier/pseudo conditions.

**Breaking:** `@parent` direct-child syntax changed from `@parent(cond >)` to `@parent(cond, >)` to avoid ambiguity with inner condition parsing.

**Fixed:** `@parent(a) & @parent(b)` now correctly produces two independent `:is()` wrappers that can match different ancestors. Use `@parent(a & b)` when the same ancestor must satisfy both conditions.