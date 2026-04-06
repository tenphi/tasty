---
'@tenphi/tasty': minor
---

Add popularity-aware garbage collector for unused styles. Tracks per-className usage with DOM safety guard — styles visible in the DOM are never evicted. Exposes `gc()`, `maybeGC()`, and `touch()` APIs, with optional automatic background sweep via `configure({ gc: { auto: true } })`. Removes old dead-code auto-cleanup pipeline.
