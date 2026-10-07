---
'@tenphi/tasty': patch
---

Keep development diagnostics and debug instrumentation disabled in production
unless TASTY_DEBUG is enabled. Reusing server-rendered global styles no longer
emits a warning.
