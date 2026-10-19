---
'@tenphi/tasty': patch
---

Container queries over size features other than width/height/inline-size/block-size now work: `@(aspect-ratio > 1)` and `@(orientation: portrait)` compile to `@container (aspect-ratio > 1)` and `@container (orientation: portrait)`. Before, they became an invalid selector and the style never applied.
