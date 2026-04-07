---
'@tenphi/tasty': patch
---

Derive `TastyZeroConfig` from `TastyConfig` via `Omit` to keep the two types in sync automatically. This also widens `TastyZeroConfig` to accept `colorSpace`, `properties`, and `boolean` values in `replaceTokens` — options that were previously only available in the runtime config.
