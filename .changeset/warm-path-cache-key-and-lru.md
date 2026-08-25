---
'@tenphi/tasty': patch
---

Drop three hash lookups from every LRU read.

The LRU list stored keys rather than node references, so every `get()` of a
non-most-recent entry did `map.get()` three times — previous, next and the
current head — purely to rewire pointers. In a production trace of a real app
that showed up as 12.9 ms across `touch` / `get` / `set`.

The list now holds nodes directly, which makes rewiring pure pointer work, and
a `get()` that hits the most-recent entry returns after a single lookup.
Eviction, `onEvict`, iteration order of `keys()` and every other observable
behaviour are unchanged.

All ten caches benefit: `pipelineCache`, `conditionCache`, `parseCache`,
`simplifyCache`, the parser cache, `cacheWrapper`, and the colour caches. They
are read-mostly and hit on every render once warm. A read that has to rewire
the list — the steady-state shape — measures 1.79x faster.
