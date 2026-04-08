---
'@tenphi/tasty': patch
---

Fix duplicate global CSS (tokens, @property, @font-face, @counter-style) when RSC and SSR paths both emit internals in Next.js App Router. The SSR collector now skips internals already emitted by the RSC inline-style path.
