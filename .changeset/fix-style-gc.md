---
'@tenphi/tasty': minor
---

Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

What a style is worth keeping is now decided by the DOM. A sweep scans for the classes actually on the page and sorts everything the injector holds into five bands — rendered, not ours to delete, cold for less than `gc.grace` (default 10s), cold but within `capacity`, and everything else — of which only the last is deleted. Rendering is not commit-aware, so a render can resolve a class and commit it a little later; rather than try to tell that apart from a class that is finished, collection leaves alone anything it has only just noticed going cold.

- New `gc.grace`. A class counts as wanted when it is injected, and again every sweep that finds it on an element.
- Collection costs nothing on the render path: the timestamp is written by the sweep's own DOM scan, so nothing is tracked per class while rendering. `touch()` is now only a render counter, and `StyleUsage` is gone with the map it described.
- `gc()` and `cleanup()` collect on demand, and now actually delete.
- Local `@keyframes` are disposed with the class that animates them rather than leaking a reference per render.
