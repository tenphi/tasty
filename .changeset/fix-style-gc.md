---
'@tenphi/tasty': minor
---

Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their ref counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero ref count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

A style's lifetime is now decided by the DOM: `gc()` collects classes that no element carries, keeping the `capacity` most recently used, and an outstanding `inject()` reference still pins a class on top of that. `inject()` accepts `{ track: false }` for callers that keep no handle — what the render path now uses — and the scheduled GC never runs inline during a render.
