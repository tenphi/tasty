---
'@tenphi/tasty': minor
---

Add `presets` and `bodyStyles` options to `configure()`. `presets` is a shorthand for `generateTypographyTokens()` that merges generated tokens under explicit `tokens`. `bodyStyles` applies Tasty styles to the `body` tag across all rendering modes. Both options are also available in plugins and zero-runtime config. Typography preset fields now accept state maps for responsive/theme-aware values.
