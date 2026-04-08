---
'@tenphi/tasty': patch
---

Auto-skip global CSS injection on client when SSR styles are present. When `<style data-tasty-ssr>` is detected in the document, `markStylesGenerated()` skips re-injecting tokens, `@property`, `globalStyles`, `@font-face`, and `@counter-style` that were already rendered by the SSR collector. This eliminates the need for `typeof window === 'undefined'` guards in `configure()` calls.
