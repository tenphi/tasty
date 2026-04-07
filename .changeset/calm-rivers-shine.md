---
'@tenphi/tasty': patch
---

Change default `letterSpacing` in typography presets from `'0'` to `'normal'`. Derive `TastyZeroConfig` from `TastyConfig` via `Omit` to keep the two types in sync automatically.
