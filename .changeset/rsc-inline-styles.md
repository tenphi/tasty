---
'@tenphi/tasty': patch
---

Add RSC inline style emission — tasty() components now render correctly as React Server Components by emitting inline `<style>` tags when no SSR collector or DOM is available.
