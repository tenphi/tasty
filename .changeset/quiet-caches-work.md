---
'@tenphi/tasty': patch
---

Fix package imports under React 18 by using the React 19 server cache API only when available. React 18 client rendering and collector-backed SSR can load the runtime without a missing-export error; React 19 retains request-scoped caching.
