---
'@tenphi/tasty': minor
---

Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, unifying their internal representation as modifier/pseudo conditions and removing duplicated code paths.