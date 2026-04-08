---
'@tenphi/tasty': minor
---

Add `presets` and `globalStyles` options to `configure()`. `presets` is a shorthand for `generateTypographyTokens()` that merges generated tokens under explicit `tokens`. `globalStyles` is a `Record<string, Styles>` that applies Tasty styles to arbitrary CSS selectors across all rendering modes. Both options are also available in plugins and zero-runtime config. Typography preset fields now accept state maps for responsive/theme-aware values.
