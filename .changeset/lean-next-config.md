---
'@tenphi/tasty': patch
---

Reduce the Next.js configuration helper dependency graph by generating shared
configuration CSS through the build-time style engine instead of the browser
runtime and request-scoped SSR collector.
