---
'@tenphi/tasty': minor
---

Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

What a style is worth keeping is now decided by the DOM. A sweep scans for the classes actually on the page and sorts everything the injector holds into five bands — rendered, not ours to delete, cold for less than `gc.grace` (default 10s), cold but within `capacity`, and everything else — of which only the last is deleted. Rendering is not commit-aware, so a render can resolve a class and commit it a little later; rather than try to tell that apart from a class that is finished, collection leaves alone anything it has only just noticed going cold.

- New `gc.grace`. A class counts as wanted when it is injected, and again every sweep that finds it on an element.
- Collection costs nothing on the render path: the timestamps are written by the sweep's own DOM scan, so nothing is tracked per class while rendering. `touch()` is deprecated and now only counts renders to pace sweeps — the class name it takes is ignored, since a class handed back by `inject()` is marked wanted there instead. `StyleUsage` is deprecated too, describing a record nothing keeps any more. Both stay exported so existing imports keep working.
- `gc()` and `cleanup()` collect on demand, and now actually delete.
- Local `@keyframes` are owned by the classes whose rules actually name them: one reference however many times they render, released when the last owner is collected. Local `@keyframes` are emitted under a content-addressed name — `fade-<hash of its steps>` — resolved the same way by the client, the SSR collector and the RSC pass, and folded into the chunk's cache key. Two components authoring the same `animation: fade 1s` over different `@keyframes fade` therefore get two rules and two classes on every path, instead of one definition silently winning and the server and client disagreeing about which class to use. New `holdKeyframes()` and `ownKeyframes()`.
- `tastyDebug.summary()` accounts for every class the injector holds, including ones that have gone cold but are not collectable yet — reported as `hotClasses` and on a new `Held:` line.
- Bundle limits move for keyframe ownership and the fuller summary accounting: main 56.6 -> 56.9 kB, core 53.65 -> 53.9 kB. The other three are unchanged and under.
