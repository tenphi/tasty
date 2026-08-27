---
'@tenphi/tasty': minor
---

Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

A style's lifetime is now decided by the DOM: `gc()` collects classes that no element carries, keeping the `capacity` most recently used, and a class **pinned** by an outstanding `inject()` handle is held on top of that. `inject()` accepts `{ pin: false }` for callers that keep no handle — what the render path now uses — and the scheduled GC never runs inline during a render.

Renamed to match: `RootRegistry.refCounts` is now `RootRegistry.pinCounts`. Only code reaching into the injector's internal registry is affected.

Automatic sweeping is now opt-in, behind `gc.unsafeAutoCollect`. A sweep judges a class finished by not finding it in the DOM, which it cannot tell apart from a concurrent render that has injected a class and not yet committed it — so a scheduled sweep can delete rules a pending render is about to attach. Since the broken counts meant `configure({ gc: ... })` collected nothing before, making collection work would otherwise have switched those apps straight onto that path. `gc()` and `cleanup()` are unaffected and run when you call them.

Also adds `gc.timeoutFallback`. With automatic sweeping enabled but no `requestIdleCallback`, the sweep previously ran inline, inside the render that touched the class; it is now skipped unless this opts into a deferred timeout.
