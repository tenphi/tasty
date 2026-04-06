---
'@tenphi/tasty': patch
---

Remove `TastySSRContext` React context from SSR pipeline. All hooks now discover the SSR collector via the same global getter used by `computeStyles()`, eliminating the need for a React context Provider in `TastyRegistry`. This simplifies the SSR architecture to a single collector discovery mechanism.
