---
'@tenphi/tasty': minor
---

Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

A style's lifetime is now decided by the DOM: `gc()` collects classes that no element carries, keeping the `capacity` most recently used, and a class **pinned** by an outstanding `inject()` handle is held on top of that. `inject()` accepts `{ pin: false }` for callers that keep no handle — what the render path now uses — and the scheduled GC never runs inline during a render.

Renamed to match: `RootRegistry.refCounts` is now `RootRegistry.pinCounts`. Only code reaching into the injector's internal registry is affected.

The scheduled sweep only collects a class some sweep has previously seen on an element, since a concurrent render can yield between `inject()` and commit for any number of turns and must never lose the rules it is about to attach. A class that mounts and unmounts between two sweeps is therefore not collected automatically; it stays cached, and an explicit `gc()` or `cleanup()` takes it.
