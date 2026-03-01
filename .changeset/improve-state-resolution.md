---
'@tenphi/tasty': minor
---

Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, correctly preserving OR branches as separate selector variants and unifying their internal representation as modifier/pseudo conditions.