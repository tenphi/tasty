---
'@tenphi/tasty': minor
---

Cut per-render styling overhead: faster LRU reads everywhere, and memoized
chunk cache keys on the server.

**LRU reads no longer pay three extra hash lookups**

The LRU list stored keys rather than node references, so every `get()` of a
non-most-recent entry did `map.get()` three times — previous, next and the
current head — purely to rewire pointers. In a production trace of a real app
that showed up as 12.9 ms across `touch` / `get` / `set`.

The list now holds nodes directly, which makes rewiring pure pointer work, and
a `get()` that hits the most-recent entry returns after a single lookup.
Eviction, `onEvict`, iteration order of `keys()` and every other observable
behaviour are unchanged. All ten caches benefit — `pipelineCache`,
`conditionCache`, `parseCache`, `simplifyCache`, the parser cache,
`cacheWrapper` and the colour caches. A read that has to rewire the list, which
is the steady-state shape, measures 1.79x faster.

**`computeStyles({ stableStyles: true })` memoizes chunk cache keys**

`generateChunkCacheKey()` runs once per chunk per render and stable-stringifies
every style value in the chunk before any cache is consulted. On the client
that mostly does not matter, because a component whose styles never change is
short-circuited by a factory-level class-name cache. On the server that cache
is deliberately skipped — `computeStyles()` is what feeds the per-request SSR
collector and what produces the RSC inline `<style>`, so short-circuiting it
would return a class name for CSS that was never emitted for that request.
Every server render therefore re-derives the same keys from the same object.

`stableStyles` marks a styles object that outlives the call and will be passed
in again — a `tasty()` factory's own styles rather than a per-render merge. The
generated keys are then memoized on that object. `tasty()` sets it
automatically; there is nothing to configure. A repeat SSR render of one
component measures **1.8x faster end to end**, not just in key generation.

The flag gates only the write. Reading an existing entry is free and
unconditional, so nothing has to opt in to benefit from what already ran, and
a per-render merged styles object — the common client case — is never stored
and pays nothing. Deliberately not enabled for objects tasty cannot vouch for:
recipe resolution rewrites the styles object, and a rewritten object is treated
as per-render.

A memo hit re-reads every value the key was built from and confirms none of
them changed, using the same shallow reference comparison `stableStyles`'
sibling caches already rely on. A memoized key is stale in exactly the cases
the un-memoized one was already stale in — an object-valued style mutated in
place — and in no others. `Styles` remains a plain mutable object; nothing new
is required of callers.

`generateChunkCacheKey()` takes a matching optional fourth argument for direct
callers. It defaults to the previous behaviour.
