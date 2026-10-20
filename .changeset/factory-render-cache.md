---
'@tenphi/tasty': patch
---

`tasty()` components no longer render unstyled after `gc()`, `cleanup()` or `destroy()` deleted their rules: the class name cached for the component's styles is dropped with them, and the next render injects the CSS again.

Re-rendering also does less work. Instance `styles` that stay the same object between renders — an extension's defaults, a module-level constant, a memoized object — are merged and computed once, where they used to go through `mergeStyles()` and `computeStyles()` on every render. Every `tasty(Base, { styles })` extension benefits.
