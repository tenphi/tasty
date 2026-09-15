---
'@tenphi/tasty': minor
---

Reduce tree-shaken runtime bundle sizes with semantic shared chunks.

**Changed:** `tastyDebug` is no longer auto-installed on `window` in development.
Call `tastyDebug.install()` before using it from the browser console. Keeping the
install explicit is what lets the debug tooling stay out of the runtime chunk.
