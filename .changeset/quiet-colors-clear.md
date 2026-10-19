---
'@tenphi/tasty': patch
---

Make `#clear` a default replace token for `transparent`. Numeric and custom-property opacity suffixes on transparent aliases are ignored, so `#clear.5` stays transparent. Remove the predefined `@property --clear-color`; CSS and local token overrides of `--clear-color` no longer affect `#clear`. Use another color token or explicitly override `replaceTokens['#clear']` to customize it.
