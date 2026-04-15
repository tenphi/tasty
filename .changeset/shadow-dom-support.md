---
'@tenphi/tasty': minor
---

Add Shadow DOM support: `useStyles`, `useGlobalStyles`, and `computeStyles` now accept a `root` option (`Document | ShadowRoot`) to inject styles into a specific shadow root. Styles are injected via `adoptedStyleSheets` when targeting a shadow root, with a shared `ChunkSheetRegistry` for deduplication across multiple shadow roots.
