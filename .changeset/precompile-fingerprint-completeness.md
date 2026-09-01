---
'@tenphi/tasty': patch
---

Close five gaps in the precompiled-catalog configuration guard.

- **`replaceTokens` is fingerprinted.** It substitutes at parse time, so its value is baked into the declaration while the chunk's lookup key still hashes the unchanged source `padding: "$pad"` — a catalog compiled against `8px` hit under a runtime mapping it to `16px` and served the old spacing. Bare-key parse functions are recorded too, and handlers / props middleware now carry their real definitions rather than a constant marker. (`configure({ tokens })` is deliberately excluded: those resolve to `var(--brand-color)`, which stays correct across a palette change.)
- **Validation runs before dependencies are seeded.** It happened only at chunk lookup, but browser, SSR and RSC all apply dependencies first. An incompatible manifest could seed `@property` and keyframe metadata, after which fallback generation treated those definitions as already present and skipped the rules it should have emitted — and a manifest contributing only dependencies never reached a lookup at all.
- **A catalog is only served to the document that owns its CSS.** Previously only `ShadowRoot` was excluded, so rendering into an iframe's `Document` could return a class whose rule is not in that document.
- **Nested manifest entries are validated.** The documented workflow casts imported JSON, and `keyframes: [{}]` or `chunks: [null]` used to throw during registration instead of being warned about and ignored.
- **`autoPropertyTypes` compares effective behaviour.** It defaults to enabled, so an omitted value and an explicit `true` are identical and no longer read as a divergence.
