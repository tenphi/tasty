---
'@tenphi/tasty': patch
---

Preserve environment checks in the published package so production consumers
do not enable development diagnostics or debug instrumentation by default.
Keep the TASTY_DEBUG override available in production.
