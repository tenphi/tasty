---
'@tenphi/tasty': patch
---

Add `inherit` support for the `radius` style property. Standalone `radius="inherit"` outputs `border-radius: inherit`. With directional modifiers (e.g. `radius="inherit right"`), longhand properties are used since CSS-wide keywords cannot be mixed with other values.
