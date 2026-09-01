---
'@tenphi/tasty': patch
---

Close five gaps in the precompiled-catalog configuration guard.

- **Tokens are fingerprinted.** A token's value never reaches a chunk cache key — the key hashes `color: "#brand"`, not what `#brand` resolves to — so a catalog compiled against one palette still hit under a runtime with another and served the wrong colours. Both `configure({ tokens })` and `replaceTokens` are now recorded, along with bare-key parse functions and the real handler / props-middleware definitions rather than a constant marker.
- **Validation runs before dependencies are seeded.** It happened only at chunk lookup, but browser, SSR and RSC all apply dependencies first. An incompatible manifest could seed `@property` and keyframe metadata, after which fallback generation treated those definitions as already present and skipped the rules it should have emitted — and a manifest contributing only dependencies never reached a lookup at all.
- **A catalog is only served to the document that owns its CSS.** Previously only `ShadowRoot` was excluded, so rendering into an iframe's `Document` could return a class whose rule is not in that document.
- **Nested manifest entries are validated.** The documented workflow casts imported JSON, and `keyframes: [{}]` or `chunks: [null]` used to throw during registration instead of being warned about and ignored.
- **`autoPropertyTypes` compares effective behaviour.** It defaults to enabled, so an omitted value and an explicit `true` are identical and no longer read as a divergence.
