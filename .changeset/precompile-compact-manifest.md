---
'@tenphi/tasty': patch
---

Shrink the precompiled manifest by about 90%.

Each chunk recorded its `lookupKey` — the serialized style source, averaging
342 bytes for a real design system — so the lookup table came out larger than
the stylesheet it indexes. Nothing ever read it back: the runtime hashes its
own cache key and compares. Chunks are now keyed by `hashString(lookupKey)`,
and record a `className` only when it cannot be derived as
`namePrefix + key`, which is just the keyframe-dependent ones.

Measured on the `@cube-dev/ui-kit` catalog (541 chunks, unchanged CSS):

|               |                    before |                     after |
| ------------- | ------------------------: | ------------------------: |
| `manifest.js` | 267.3 KB (20.1 KB brotli) |   28.8 KB (4.2 KB brotli) |
| catalog total | 964.8 KB (52.7 KB brotli) | 726.3 KB (36.8 KB brotli) |

A 30% cut in what a catalog costs over the wire, and the same saving in
retained heap, since the store no longer holds every style source as a map key.
Lookup speed is unchanged — the hash replaces the one V8 computed to probe a
map keyed by the full string.

This narrows nothing that was not already narrow: a runtime class name is that
same hash, so two sources colliding would already collide today. What it gives
up is naming the offending styles in a chunk-conflict warning, which now names
the hash.

**Reading a manifest**: resolve a class name as
`chunk.className ?? manifest.namePrefix + chunk.key`, not `chunk.className`.
Manifests are already rejected across Tasty versions, so no catalog built by an
earlier version reaches this code.
