---
'@tenphi/tasty': minor
---

Add opt-in batched style injection and make `touch()` skip redundant work.

**Batched injection (`configure({ batchInjection: true })`)**

Every `insertRule()` on a live stylesheet invalidates style for that sheet's
scope. Components inject during React's render phase, so if anything else reads
layout in the same pass — popovers measuring content, autosizing inputs,
virtualized rows — the two interleave and the browser is forced to recalculate
style between every injection. A Chrome trace of a real app showed 16 forced
recalculations totalling 62 ms sandwiched between `insertRule` calls, with one
475 ms task containing 52 injections and 17 recalculations.

Batching queues the writes and applies them together, invalidating once per
flush. All writes share one FIFO — component rules, global rules, raw CSS,
`@property`, `@keyframes`, `@font-face`, `@counter-style`, `@function` — so the
resulting sheet is byte-identical to unbatched output, which matters because
equal-specificity rules resolve by document order.

Deferring a write past React's layout phase would let a `useLayoutEffect`
measure an element whose rules are not in the sheet yet, reading the unstyled box
— a wrong number, not a stale one. The new `<TastyBatchProvider>` closes that
hole: it opens a batch window during its render and flushes in
`useInsertionEffect`, which React runs before any layout effect. In the default
`true` mode a write is only queued inside such a window, so enabling the flag can
make injection cheaper but never make a measurement wrong. Everything outside a
window — a deep update the provider did not re-render for, an injection from a
layout effect or event handler, SSR, RSC — is written straight through as before.

`'always'` drops the gate and queues unconditionally, flushing on a microtask.
It covers more commits and accepts the measurement hazard above. Paint is
unaffected in both modes: microtasks always drain before the browser paints.

Safe to enable in shared code: SSR and RSC collect CSS as text, so the runtime
injector never runs there and the provider is inert without a `document`.
Zero-runtime `tastyStatic` styles are extracted at build time and never reach the
injector, so they are unaffected too. Astro islands are separate React roots — in
`true` mode a provider covers only its own island. See
`docs/configuration.md#batched-injection`.

New exports: `TastyBatchProvider`, `flushStyles()`, `hasPendingStyleWrites()`,
`resetStyleBatch()`. Default is `false` — nothing changes unless you opt in.

**`touch()` fast path**

`touch()` runs on every render of every `tasty()` component, and on a fully
cached render it is the only work left. It only ever stamps `lastTouchedAt` with
the millisecond it is already in, so re-touching the same class-name string
inside that millisecond rewrote the value it already held. It now returns early
after one `Set` lookup instead of a string split, a regex test and two `Map`
operations per chunk. GC scheduling now counts distinct class names per
millisecond rather than raw calls, so garbage collection triggers marginally
less often.
