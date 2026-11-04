---
'@tenphi/tasty': patch
---

`tasty.config.ts` lists `$icon-size`, which every `preset` sets next to `$bold-font-weight`, so the ESLint plugin's `valid-custom-property` no longer reports it as unknown.
