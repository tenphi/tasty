---
'@tenphi/tasty': patch
---

Cut per-render overhead in chunk cache-key generation and in the LRU read path.

**Chunk cache keys are memoized on the styles object**

`generateChunkCacheKey()` runs once per chunk per render, before any cache is
consulted, and stable-stringifies every style value in the chunk just to decide
whether there is anything to do. In a production trace of a real app it
accounted for 23 ms of the 167 ms tasty spends on work that recurs on every
re-render — about 14% of the warm path, spent deciding to do nothing.

The generated key now caches on the identity of the styles object, keyed by
chunk name and verified against the chunk's style keys. A styles object that
survives across renders — what a `tasty({ styles })` definition produces — pays
one `Map` lookup instead of the serialization pass. Where the styles object is
freshly built each render, the key is recomputed exactly as before.

This treats a styles object as immutable once handed to the engine, which is
what the existing stable-stringify and local-predefined-states caches already
assumed. Mutating a styles object in place rather than creating a new one was
already unsupported.

The key builder also no longer accumulates the concatenated chunk-styles string
used for predefined-state lookup unless the styles object actually defines local
predefined states. That string was built on every call and discarded unread in
the common case.

**LRU rewiring no longer costs three extra hash lookups per read**

The LRU list stored keys rather than node references, so every `get()` of a
non-most-recent entry did `map.get()` three times — previous, next and current
head — purely to rewire pointers. The list now holds nodes directly, which makes
rewiring pure pointer work; a `get()` that hits the most-recent entry returns
after a single lookup. Eviction, `onEvict`, iteration order of `keys()` and
every other observable behaviour are unchanged.

All ten caches benefit: `pipelineCache`, `conditionCache`, `parseCache`,
`simplifyCache`, the parser cache, `cacheWrapper`, and the colour caches. They
are read-mostly and hit on every render once warm.
