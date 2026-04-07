---
'@tenphi/tasty': patch
---

Share SSR AsyncLocalStorage and collector getter on `globalThis` so Astro and similar setups with split module graphs see one collector.
