---
'@tenphi/tasty': patch
---

Rewrite the custom-property declaration regex in `PropertyTypeResolver` so no two quantifiers can claim the same trailing whitespace (CodeQL `js/polynomial-redos`). A declaration whose value is only whitespace — `--brand-color: ;` — is now skipped rather than read as an empty value, so it no longer auto-registers an `@property` off the strength of its name. Values with leading or trailing whitespace, including the newline left on the last declaration of a block written without a trailing semicolon, are read exactly as before.
