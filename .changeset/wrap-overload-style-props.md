---
'@tenphi/tasty': patch
---

Allow `styleProps`, `variants`, `modProps`, and `tokenProps` in the
`tasty(Component, options)` wrap overload — previously these were typed as
`never`, which forced consumers to cast `Component as any` even though the
runtime already supported these options.
