---
'@tenphi/tasty': patch
---

Fix missing color tokens on pages without RSC-rendered tasty components (e.g. the playground route). The `globalThis.__tasty_rsc_internals_emitted__` flag leaked across requests in the same Node.js process, causing the SSR collector to skip token emission for pages where RSC did not actually emit them. Internals (tokens, `@property`, `@font-face`, `@counter-style`) are now emitted exclusively by the SSR collector, and the cross-graph globalThis flag is removed.
