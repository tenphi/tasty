---
'@tenphi/tasty': patch
---

Reduce tree-shaken runtime bundle sizes with semantic shared chunks. `tastyDebug`
now requires an explicit `tastyDebug.install()` call before browser-console use.
