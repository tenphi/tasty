---
'@tenphi/tasty': minor
---

Make tasty() components hook-free and compatible with React Server Components. Styles are now computed synchronously via `computeStyles()`, removing the need for `'use client'` directives. SSR collectors are discovered via AsyncLocalStorage. Removes dead code: `stringifyTokens`, top-level `allocateClassName`, and `trackRef` wrappers.
