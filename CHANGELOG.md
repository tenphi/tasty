# @tenphi/tasty

## 3.5.0

### Minor Changes

- [#282](https://github.com/tenphi/tasty/pull/282) [`55ffef1`](https://github.com/tenphi/tasty/commit/55ffef17372224d4c17904cf34fc2a0284822cd6) Thanks [@tenphi](https://github.com/tenphi)! - Add build-wide shared stylesheet extraction to the Astro integration, with CSP
  nonce support and client-side global style deduplication.

- [#281](https://github.com/tenphi/tasty/pull/281) [`996910b`](https://github.com/tenphi/tasty/commit/996910bed6675373fbc77e643a8b5213bbdf017a) Thanks [@tenphi](https://github.com/tenphi)! - Fix garbage collection of rendered styles. Since the render path became hook-free it no longer disposes the classes it injects, so their counts never fell back to `0` — and `gc()`, `cleanup()` and `tastyDebug.cleanup()` all treated a non-zero count as "still in use". Nothing was ever evicted, and injected CSS grew for the lifetime of the page.

  What a style is worth keeping is now decided by the DOM. A sweep scans for the classes actually on the page and sorts everything the injector holds into five bands — rendered, not ours to delete, cold for less than `gc.grace` (default 10s), cold but within `capacity`, and everything else — of which only the last is deleted. Rendering is not commit-aware, so a render can resolve a class and commit it a little later; rather than try to tell that apart from a class that is finished, collection leaves alone anything it has only just noticed going cold.

  - New `gc.grace`. A class counts as wanted when it is injected, and again every sweep that finds it on an element.
  - Collection costs nothing on the render path: the timestamps are written by the sweep's own DOM scan, so nothing is tracked per class while rendering. `touch()` is deprecated and now only counts renders to pace sweeps — the class name it takes is ignored, since a class handed back by `inject()` is marked wanted there instead. `StyleUsage` is deprecated too, describing a record nothing keeps any more. Both stay exported so existing imports keep working.
  - `gc()` and `cleanup()` collect on demand, and now actually delete.
  - Local `@keyframes` are owned by the classes whose rules actually name them: one reference however many times they render, released when the last owner is collected. Local `@keyframes` are emitted under a content-addressed name — `fade-<hash of its steps>` — resolved the same way by the client, the SSR collector and the RSC pass, and folded into the chunk's cache key. Two components authoring the same `animation: fade 1s` over different `@keyframes fade` therefore get two rules and two classes on every path, instead of one definition silently winning and the server and client disagreeing about which class to use. New `holdKeyframes()` and `ownKeyframes()`.
  - `tastyDebug.summary()` accounts for every class the injector holds, including ones that have gone cold but are not collectable yet — reported as `hotClasses` and on a new `Held:` line.
  - Bundle limits move for keyframe ownership, deterministic keyframe naming and the fuller summary accounting: main 56.6 -> 57.5 kB, core 53.65 -> 54.5 kB. The other three are unchanged and under.

### Patch Changes

- [#281](https://github.com/tenphi/tasty/pull/281) [`996910b`](https://github.com/tenphi/tasty/commit/996910bed6675373fbc77e643a8b5213bbdf017a) Thanks [@tenphi](https://github.com/tenphi)! - Rewrite the custom-property declaration regex in `PropertyTypeResolver` so no two quantifiers can claim the same trailing whitespace (CodeQL `js/polynomial-redos`). A declaration whose value is only whitespace — `--brand-color: ;` — is now skipped rather than read as an empty value, so it no longer auto-registers an `@property` off the strength of its name. Values with leading or trailing whitespace, including the newline left on the last declaration of a block written without a trailing semicolon, are read exactly as before.

- [#281](https://github.com/tenphi/tasty/pull/281) [`996910b`](https://github.com/tenphi/tasty/commit/996910bed6675373fbc77e643a8b5213bbdf017a) Thanks [@tenphi](https://github.com/tenphi)! - Fix `tastyDebug` reporting zero unused classes. `summary()`, `cache()` and `css('unused')` derived "unused" from counters the render path stopped maintaining, so they always came up empty and silently dropped every injected-but-detached class from the totals — a page holding hundreds of stale rules printed `Unused: 0 classes`. Unused is now the set `gc()` would collect, read from the injector rather than recomputed, so the two cannot drift apart again.

  The summary's totals are also the real totals now: raw CSS is read from the sheet it lives in and counted by the rules the engine parsed rather than by counting braces, and `@font-face`, `@counter-style` and `@function` are included. `css('all')` includes raw CSS, as it was already documented to — spliced in at the position the DOM gives its sheet, so two rules of equal specificity are reported with the winner the page actually applies. Reads that reach into the registry rather than through an injector API land the pending writes first, so a report taken inside a batch window no longer describes it as empty.

  Bundle limit: babel-plugin 49.35 -> 49.6 kB.

## 3.4.0

### Minor Changes

- [#275](https://github.com/tenphi/tasty/pull/275) [`05ad7a8`](https://github.com/tenphi/tasty/commit/05ad7a86a90165474bd2ba86f79b50bdbf8d9b8e) Thanks [@tenphi](https://github.com/tenphi)! - Cut per-render styling overhead: faster LRU reads everywhere, and memoized
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
  anything that would be stored without being read back is left out: a per-render
  merged styles object, a styles object rewritten by recipe resolution, and every
  client render — where the factory-level class-name cache answers everything
  after the first, so `computeStyles()` never sees the same object twice. Storing
  an entry costs roughly twice what generating the key does, so a write-only opt
  -in is worse than no memo at all.

  A memo hit re-reads every value the key was built from and confirms none of
  them changed, using the same shallow reference comparison `stableStyles`'
  sibling caches already rely on. A memoized key is stale in exactly the cases
  the un-memoized one was already stale in — an object-valued style mutated in
  place — and in no others. `Styles` remains a plain mutable object; nothing new
  is required of callers.

  `generateChunkCacheKey()` takes a matching optional fourth argument for direct
  callers. It defaults to the previous behaviour.

## 3.3.1

### Patch Changes

- [#273](https://github.com/tenphi/tasty/pull/273) [`5cea972`](https://github.com/tenphi/tasty/commit/5cea972ba4191337c315c49f3b38a118e80e7098) Thanks [@tenphi](https://github.com/tenphi)! - `#current` compiles to the `currentcolor` keyword again, as it did before 3.3.0.

  3.3.0 made it emit `var(--current-color)` so that a token _defined_ as `#current`
  could be faded on Safari 16.4 rather than 18 — relative color syntax takes a
  concrete origin from 16.4, while `oklch(from currentcolor …)` needs 18. That
  traded away the property `#current` exists for.

  The keyword resolves against the element that reads it, so a `#current` under an
  ancestor that faded its own color reads the _faded_ color. A ramp built on
  `#current` depends on it: the disabled state is expressed once, in `color`, and
  everything painted from `#current` below fades with it. The variable cannot do
  that — a faded color is deliberately never published into `--current-color`
  (resolving it a second time one level down would fade it twice), so a reader saw
  through to the unfaded color above and rendered at full strength.

  The variable itself stays, and keeps both improvements 3.3.0 brought it. It
  carries the inherited color for consumers that need it as a color rather than as
  the keyword — hand-authored CSS, or anywhere the keyword will not do. Read it as
  `$current-color`:
  - Every color publishes it, not only a named token, so a reader below takes the
    nearest `color` rather than the nearest _token_ color.
  - It is registered with `initial-value: currentcolor`, so where nothing published
    it a reader still resolves against its own element.

  The case 3.3.0 set out to fix goes back to needing Safari 18: a token defined as
  `#current` and then faded — `{ '#ink': '#current', fill: '#ink.5' }` — gives
  relative color syntax a `currentcolor` origin. Put the fade in the token instead,
  `{ '#ink': '#current.5' }`, and it goes through `color-mix()` on the Safari 16.2
  floor.

## 3.3.0

### Minor Changes

- [#271](https://github.com/tenphi/tasty/pull/271) [`5184052`](https://github.com/tenphi/tasty/commit/5184052dd3d1767a21ca80129e38b34a44702cc0) Thanks [@tenphi](https://github.com/tenphi)! - Colors are emitted as authored, and the `--name-color-{colorSpace}` channel
  companions are gone.

  Two things existed only to serve the opacity suffix back when it needed numeric
  channels to write an alpha into:
  - A `#name` token declared a second variable holding its channels decomposed —
    `--brand-color-oklch: 0.75 0.16 55` — plus a matching `@property` rule, and a
    `color` style emitted `--current-color-{space}` beside `--current-color`.
  - A token's value was rewritten into the configured `colorSpace`, so
    `#brand: '#ff8800'` declared `--brand-color: oklch(0.75 0.16 55)`.

  Opacity now uses relative color syntax — `oklch(from var(--brand-color) l c h /
.5)` — which has the browser read the channels off whatever the value resolves
  to. Neither is load-bearing any more, so both are removed and a color passes
  through untouched: `--brand-color: #ff8800`.

  `configure({ colorSpace })` is **deprecated** — still accepted, no longer has any
  effect, warns in development, and will be removed in the next major.

  No public API changes: nothing exported moves and class name hashes are
  identical. What changes is the emitted CSS.

  ```css
  /* before */
  color: oklch(var(--brand-color-oklch) / 0.5);
  background: oklch(var(--brand-color-oklch));

  /* after */
  color: oklch(from var(--brand-color) l c h / 0.5);
  background: var(--brand-color);
  ```

  If you relied on `colorSpace` for uniform output, author the token in the space
  you want — the value is no longer rewritten. See
  [Color space](https://github.com/tenphi/tasty/blob/main/docs/configuration.md#color-space).

  What it buys:
  - **~2.0 kB brotli off `main` and `core`, ~2.6 kB off `static`, `zero` and
    `babel-plugin`** — the whole sRGB round-trip and the LRU cache that memoized
    it are gone.
  - One declaration less per color in every emitted rule, and one fewer inline
    style property per `#name` entry in the `tokens` prop.
  - One `@property` registration less per color token, on the runtime, SSR, RSC and
    zero-runtime paths.
  - A pre-pass removed from `PropertyTypeResolver.scanDeclarations`, so every
    injection does less work.

  Also fixes `parseColor()` not recognizing a CSS named color that starts with
  `r`, `h`, `l`, `o`, `v`, `c`, or `t` — `red`, `hotpink`, `lime`, `orange`,
  `violet`, `coral` and `teal` were rejected (and warned about) where `blue` and
  `green` were accepted, purely because of the first-character dispatch. Every
  named color resolves now.

### Patch Changes

- [#271](https://github.com/tenphi/tasty/pull/271) [`5184052`](https://github.com/tenphi/tasty/commit/5184052dd3d1767a21ca80129e38b34a44702cc0) Thanks [@tenphi](https://github.com/tenphi)! - `#current` resolves through `--current-color` instead of the `currentcolor`
  keyword, which lets a token defined as `#current` be faded on Safari 16.4 rather
  than 18.

  Relative color syntax takes a concrete origin from Safari 16.4, but
  `oklch(from currentcolor …)` needs Safari 18. A token defined as `#current` used
  to emit the bare keyword, so fading it — `{ '#ink': '#current', fill: '#ink.5' }`
  — produced exactly that unsupported form. `#current` now emits
  `var(--current-color)`, so the origin is a real color wherever a `color` style
  published one.

  Three things make the swap invisible everywhere else:
  - `--current-color` is registered with `initial-value: currentcolor`. A
    registered `<color>` property keeps the keyword as its computed value and
    resolves it against each element's own color, so an unpublished `#current` is
    indistinguishable from the keyword rather than falling back to `transparent`.
  - The `color` style now publishes `--current-color` for **every** color, not only
    a named token. A literal `color: 'red'` has to displace an ancestor's token
    color, or a descendant's `#current` would read the ancestor's.
  - `#current.N` keeps `currentcolor` inside its `color-mix()`. The mix composes, so
    a nested fade must read the already-faded color that reaches it — `#current.4`
    with `#current.18` under it still lands at `.072`. It has worked since Safari
    16.2 regardless.

  Still uncovered, and unchanged from before: a token defined as `#current` and
  faded where no `color` style published the variable — the origin is the keyword
  again, so that one case needs Safari 18.

  Verified against Safari 16.5.1, 17.3 and 18.4, and the whole chain is pinned by
  computed-style tests in a real engine.

- [#271](https://github.com/tenphi/tasty/pull/271) [`5184052`](https://github.com/tenphi/tasty/commit/5184052dd3d1767a21ca80129e38b34a44702cc0) Thanks [@tenphi](https://github.com/tenphi)! - Warn when a color function's channel arrives on the percentage scale without its
  `%`.

  `okhsl()` / `okhst()` and any `createColorFunc()` plugin read a unitless channel
  as the factor it looks like, so `okhsl(280 .8 .52)` and `okhsl(280 80% 52%)` are
  the same color. Dropping the `%` therefore lands `80` in a 0-1 slot, where it
  clamps to full saturation and renders as **white** — a plausible-looking color
  rather than an obvious mistake.

  A unitless channel above 1 cannot be a factor, so it now warns once per function
  in development, naming the offending values. `1` itself is a legitimate factor
  and stays silent, and the emitted color is unchanged.

  Found while checking whether the producer/writer scale mismatch fixed in
  [glaze#94](https://github.com/tenphi/glaze/pull/94) applied here. It does not —
  `createColorFunc` already takes factors and scales to percentages on output, and
  every other converter boundary (`hslStringToRgb`, `oklchStringToRgb`,
  `okhstToSrgb`'s `fromTone(t * 100)`) was verified correct — but the silent
  clamp on misscaled input was the same footgun.

## 3.2.0

### Minor Changes

- [#269](https://github.com/tenphi/tasty/pull/269) [`858b044`](https://github.com/tenphi/tasty/commit/858b0445bd1b14ff623d0baf7f2f10351c0ce52e) Thanks [@tenphi](https://github.com/tenphi)! - Add opt-in batched style injection and make `touch()` skip redundant work.

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

## 3.1.0

### Minor Changes

- [#266](https://github.com/tenphi/tasty/pull/266) [`b90760c`](https://github.com/tenphi/tasty/commit/b90760c937be1064438f13145eeb34043397ee37) Thanks [@tenphi](https://github.com/tenphi)! - Treat modern CSS color functions as colors so they reach the color slot of every style property.

  `light-dark()` and `contrast-color()` are now recognized alongside `color-mix()`, `color-contrast()`, `color()` and the channel functions, and the tokens inside them are expanded. `fill`, `color`, `border`, `outline`, `shadow` and `svgFill` place the whole call in their color slot instead of dropping it or emitting the unresolved DSL.
  - `light-dark()` is filed by content: `light-dark(#dark, #light)` is a color, `light-dark(1x, 2x)` stays a value, so `padding: 'light-dark(1x, 2x)'` still works.
  - `shadow` splits layers through the parser instead of `split(',')`, so a color function's own commas no longer tear a layer apart.
  - An opacity suffix on a replace token that resolves to a derived color function wraps the call — `color-mix(in oklab, <color> 50%, transparent)` — instead of appending a slash alpha the function has no channel for.
  - A color token whose value cannot be decomposed at build time gets its `--name-color-{space}` companion expressed by reference with relative color syntax, so `#token.alpha` keeps working. Such a companion is registered as `@property … syntax: "*"`; numeric companions keep `<number>+`. The SSR collector no longer emits a second, conflicting companion rule for it.
  - `parseColor()` no longer reports the name of a `var()` reference found _inside_ a color function as the color's own name — `color-mix(in oklab, #purple 50%, #red)` is not named `purple`.
  - The `tokens` prop keeps the whole fallback chain in the components companion: `(#primary, #fallback)` now yields `var(--primary-color-{space}, var(--fallback-color-{space}))` instead of only the last fallback.

- [#268](https://github.com/tenphi/tasty/pull/268) [`9c4b929`](https://github.com/tenphi/tasty/commit/9c4b92966fb5fdce19698072d09421d4900a3992) Thanks [@tenphi](https://github.com/tenphi)! - Apply the color-token opacity suffix with CSS relative color syntax instead of the channel components.

  `#purple.5` now emits `oklch(from var(--purple-color) l c h / .5)` where it previously emitted `oklch(var(--purple-color-oklch) / .5)`. The channels are copied over and the alpha slot is written, which asks nothing of the color beyond _being_ a color — so the suffix no longer needs the token decomposed into channels first.

  That makes it work where it used to break:
  - a token holding a `color-mix()`, a `light-dark()`, or a `color()` in a space Tasty cannot convert — none of which have channels to decompose
  - a `--name-color` variable declared in your own CSS, with no Tasty token definition and no companion variable behind it, which previously fell back to the `@property` initial value and silently rendered black

  Writing the alpha slot keeps two properties that compositing with `color-mix()` against `transparent` would have broken: alpha is **replaced** rather than multiplied (a token holding `rgb(255 0 0 / .8)` faded to `.5` is `.5`, not `.4`), and the alpha may be a `<number>` **or** a `<percentage>`, so `#purple.$fade` works whether `$fade` holds `.5` or `50%` — which is what `--*-opacity` properties are registered to accept. The authored digits also survive verbatim, so `#purple.07` stays `.07`.

  `#current.N` is unchanged and still **composes**: `currentcolor` is the color an element inherits, which an ancestor may already have faded, so `#current.4` means "40% of what reaches me" and a nested `#current.18` under it lands at `.072`. Color ramps built on `#current` depend on that. Its percentage is now derived by shifting the decimal point rather than multiplying, so `#current.07` emits `7%` instead of `7.000000000000001%`.

  The space is always `oklch`, whatever `colorSpace` is set to: it is unbounded, so a wide-gamut color survives a round trip that a gamut-limited space would clamp.

  **What changes for consumers:**
  - Generated CSS changes for every `#token.alpha` value. The colour and its computed serialization are unchanged — `oklch(…)`, as before — so snapshots over computed styles are largely unaffected; snapshots over _emitted_ CSS text need updating. `#current.alpha` is untouched.
  - Relative color syntax is required on the common path, moving the effective floor to Chrome 119 / Safari 16.4 / Firefox 128.
  - `parseColor().color` returns the faded form; `.name` and `.opacity` are unchanged, both read through it.

  `--name-color-{space}` companions are untouched: they are still generated, still registered as `@property`, and still what you reach for to address a token's channels. An opacity suffix does not move them — `color="#purple.5"` still reports `#purple`'s own channels in `--current-color-{space}`.

  A _replace token_ is substituted while parsing, so its colour is faded in place: `#brand: 'hsl(220 90% 50%)'` with `#brand.5` still gives `hsl(220 90% 50% / .5)`.

  Also fixes `color(name, 0.07)` emitting `7.000000000000001%`.

## 3.0.2

### Patch Changes

- [#264](https://github.com/tenphi/tasty/pull/264) [`40fa041`](https://github.com/tenphi/tasty/commit/40fa0415fdd52cc0049c87b9c77a47bc848f71dc) Thanks [@tenphi](https://github.com/tenphi)! - Fix `$name` references leaking unsubstituted into CSS from pass-through style values.

  A `$name` reference is classified as a color only when the name ends with
  `-color`; otherwise it lands in the value bucket. Handlers that read one bucket
  and fall back to their raw input therefore emitted the authored DSL verbatim,
  which browsers drop as an invalid declaration:

  ```jsx
  // Previously emitted `background-color: $current-fill-hover` and applied nothing.
  tasty({
    styles: {
      '$current-fill-hover': '#current.04',
      fill: { '': '#current.0', hovered: '$current-fill-hover' },
    },
  });
  ```

  The same happened in the other direction (`fontSize: '$my-size-color'` →
  `font-size: $my-size-color`) and in every handler that passes keyword values
  straight through: `display`, `overflow`, `whiteSpace`, `flow`, `place` /
  `align` / `justify` and their longhands, `textTransform`, `font` /
  `fontFamily`, `color`, `fill` / `backgroundColor`, `svgFill`, `background-clip`
  / `-origin` / `-repeat` / `-attachment`, and `outlineOffset`.

  All of them now substitute references before emitting. Values without a `$`
  still skip the parser entirely, so pass-through output — including case-sensitive
  font family names and `var()` references — is unchanged.

  `border` and `outline` now place a `$name` reference instead of dropping it. A
  reference fills the first free slot in shorthand order — width, then style, then
  color. The style would otherwise arrive as a keyword (`solid`, `dashed`, …) that
  a reference has no way to match, and colors are authored as `#name`: the
  `$name-color` form the parser buckets as a color is there to reference a raw CSS
  custom property, not as the way colors are written, so a reference does not reach
  for the color slot until the style slot is taken.

  ```jsx
  // Previously `1px solid var(--border-color, currentColor)` — reference dropped.
  tasty({ styles: { border: '1bw $my-style' } });
  // Now `1px var(--my-style) var(--border-color, currentColor)`.

  // Previously `1px dashed var(--border-color, currentColor)` — reference dropped.
  tasty({ styles: { border: '1bw dashed $my-color' } });
  // Now `1px dashed var(--my-color)`.
  ```

  An explicit `#name` token still wins the color slot, `$name-color` references
  still land there directly, and a second _length_ is still ignored rather than
  promoted (two lengths are not valid in these shorthands).

- [#264](https://github.com/tenphi/tasty/pull/264) [`40fa041`](https://github.com/tenphi/tasty/commit/40fa0415fdd52cc0049c87b9c77a47bc848f71dc) Thanks [@tenphi](https://github.com/tenphi)! - Fix three ways a `$name` reference could silently do nothing.

  **A `-color`-suffixed reference is no longer confined to color slots.** The suffix
  is the only hint the parser has about an untyped reference, and it used to decide
  the bucket outright: the reference went to `colors` alone, so a handler reading
  `values` found nothing and emitted its own default instead. Across 35 style props
  the authored value simply vanished:

  ```jsx
  // Previously `padding: var(--gap)` — the reference was replaced by the default.
  tasty({ styles: { padding: '$brand-color' } });
  // Now `padding: var(--brand-color)`.
  ```

  Such a reference is now filed under both buckets (`Bucket.ColorValue`), so a color
  slot and a value slot can each read it, and it still appears once in `all`.
  `border` / `outline` place it once rather than in both the style and color slots.

  **Custom-property names keep their case.** The parser lowercased its whole input
  before classifying, which folded custom-property names too — and those are
  case-sensitive in CSS. A camelCase name could never resolve, because the token
  definition emitted `--myVar` while the reference asked for `var(--myvar)`:

  ```jsx
  // Previously `--myVar: 16px; padding: var(--myvar);` — two different properties.
  tasty({ styles: { $myVar: '2x', padding: '$myVar' } });
  // Now both sides agree on --myVar.
  ```

  Identifier bodies (`$name`, `$$name`, `#name`, `##name`) now keep their case, and
  every place that derives a CSS name from one applies the same rule, so definitions
  and references always agree. A leading capital is not a supported name and folds
  rather than being kebab-cased — `$Foo` → `--foo`, `#Purple` → `--purple-color` —
  so names should start lowercase. Everything else still folds exactly as before:
  keywords, units, function names, and hex literals (`#FF0000` is a color, not a
  name). Predefined-token _lookup_ stays case-insensitive; only the emitted name
  preserves case.

  **A reference where a token name is expected now warns instead of emitting dead
  CSS.** `preset` and `transition` interpolate their input into a custom-property
  name, which cannot be indirected through a reference — the name is needed at build
  time, and a reference only resolves in the browser. `preset: '$my-preset'` built
  `font-size: var(--var(--my-preset)-font-size, …)`: syntactically valid, unusable as
  a name, dropped by the browser without a word. `preset` now falls back to
  `inherit` (what an absent preset resolves to) and `transition` skips the entry,
  both warning once in development. Value slots are unaffected —
  `transition: 'fill $my-duration'` still works.

  Size budgets are raised by 0.25–0.5 kB per entry to fit the added logic (~250 B
  brotlied); every entry keeps headroom.

- [#256](https://github.com/tenphi/tasty/pull/256) [`b39e27f`](https://github.com/tenphi/tasty/commit/b39e27f81616c3ec6fe9fc8fd0ccd4854473223a) Thanks [@tenphi](https://github.com/tenphi)! - Fix `gridColumns` / `gridRows` emitting invalid CSS for numeric strings.

  The track-count shorthand only expanded real numbers, so `gridColumns={3}`
  produced `grid-template-columns: minmax(1px, 1fr) minmax(1px, 1fr) minmax(1px, 1fr)`
  while `gridColumns="3"` produced `grid-template-columns: 3` — invalid CSS that
  browsers drop silently. Every value inside a state map arrives as a string, so
  responsive grids were the common way to hit this:

  ```jsx
  // Previously emitted `grid-template-columns: 3` / `: 1` and applied neither.
  tasty({ styles: { gridColumns: { '': '3', '@media(w <= 600px)': '1' } } });
  ```

  Digit strings now expand exactly like numbers. Real track lists (`'1fr 2fr'`,
  `'repeat(auto-fit, minmax(200px, 1fr))'`, `'0'`) still pass through untouched,
  and `gridTemplate` converts each side independently instead of discarding the
  side that isn't a count. A negative count no longer throws inside
  `String.repeat`.

## 3.0.1

### Patch Changes

- [#254](https://github.com/tenphi/tasty/pull/254) [`5a176cc`](https://github.com/tenphi/tasty/commit/5a176cc55ba367e073ab5d9486d41f3cb5e238d4) Thanks [@tenphi](https://github.com/tenphi)! - Fix `tastyIntegration()` failing every Astro build in 3.0.0.

  The integration registered its middleware with `new URL('./astro-middleware.js', import.meta.url)`. That URL is resolved against the emitted chunk, and the v3 build hoists `tastyIntegration` out of `dist/ssr/astro.js` into a shared chunk at the `dist/` root — so it pointed at `dist/astro-middleware.js`, which does not exist, while the real file shipped at `dist/ssr/astro-middleware.js`. Astro now receives a package subpath instead, which is resolved through the `exports` map and cannot be invalidated by chunk layout.

  This also fixes `tastyIntegration({ islands: false })` silently keeping the class-list transfer script. The flag was passed through module-level state written by the integration at config-load time and read by the middleware at request time — different module instances, and different processes entirely for built output, so the middleware always saw the `true` default. Each variant now bakes its own setting in.

  Adds two entry points, `@tenphi/tasty/ssr/astro-middleware` and `@tenphi/tasty/ssr/astro-middleware-static`. They exist so Astro can resolve the middleware by specifier and are not meant to be imported directly — use `tastyMiddleware()` for manual middleware composition.

  Anyone who worked around this with a manual `src/middleware.ts` can revert to `tastyIntegration()` once on this release, or keep the manual setup — both are supported.

## 3.0.0

### Major Changes

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - At-rule naming consistency.
  1. Rename the per-component/per-recipe `'@fontFace'` and `'@counterStyle'` style keys to `'@font-face'` and `'@counter-style'` so they match the real CSS at-rule names Tasty already emits. Emitted CSS is unchanged; `@starting` is unaffected.
  2. Pluralize the global config collection options `fontFace` → `fontFaces` and `counterStyle` → `counterStyles` for consistency with the other plural collections (`properties`, `functions`, `keyframes`). The injector methods (`injector.fontFace()` / `injector.counterStyle()`) and hooks (`useFontFace` / `useCounterStyle`) are unchanged.

  Both are breaking renames. Update styles-object keys from `'@fontFace'` / `'@counterStyle'` to `'@font-face'` / `'@counter-style'`, and `configure({ fontFace, counterStyle })` to `configure({ fontFaces, counterStyles })`.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - A style group that names direction modifiers now takes a single value.

  Values and modifiers are bucketed separately per comma group, so the interleaving that `padding: '2x 4x top right'` suggests never survived parsing: `'2x top 4x right'` and `'top 2x right 4x'` were the same input, and the pairing was decided by the order the _modifiers_ happened to appear in. `'1x 2x right top'` and `'1x 2x top right'` produced different CSS, and `'1x 2x top top'` silently assigned `top` twice.

  A group that names directions now applies its **first** value to every direction it names, and extra values are ignored with a development-mode warning (silent in production, never throws). Per-side values come from comma-separated groups:

  ```
  padding: '2x 4x top right'   ->  padding: '2x top, 4x right'
  margin:  'right 1x top 2x'   ->  margin:  '1x right, 2x top'
  inset:   'left 2x right 1x'  ->  inset:   '2x left, 1x right'
  fade:    '3x 1x top bottom'  ->  fade:    '3x top, 1x bottom'
  ```

  Affects `padding`, `margin`, `inset`, `scrollMargin`, and `fade`.

  **Unchanged:** single-value directional groups (`padding: '2x top'`, `'1x left right'`), every value-only CSS shorthand form (`padding: '1x 2x'`, `'1x 2x 3x 4x'`, and now `fade: '3x 1x'` too — a group that names no direction is unambiguous and keeps plain shorthand order), CSS-wide keywords, and the `longhand` modifier.

  `inset`'s `dock` modifier keeps its two-value form, with sharper semantics: the first value applies to the named edge and the second to the perpendicular sides it spans, so `inset: '2x 4x bottom dock'` still gives `auto 32px 16px 32px`. A third value with `dock`, or a second value without it, now warns. `dock` is `inset`-only, so `padding`, `margin`, and `scrollMargin` get the strict one-value rule with no exception.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - Rename the per-component/per-recipe `'@properties'` style key to `'@property'` so it matches the real CSS at-rule name (`@property`), which is what Tasty already emits. The emitted CSS (`@property --name { ... }`) is unchanged. The global config field `configure({ properties })` and the `autoPropertyTypes` flag are unchanged — only the styles-object key is renamed.

  This is a breaking rename for any styles using `'@properties': { ... }`; update those keys to `'@property'`.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - ## v3 consistency pass

  Finishes the renames the rest of the v3 cleanup started, removes what was never meant to be public, and fixes a class of bug where a second `configure()` call discarded the first one's values.

  ### Repeated `configure()` now merges instead of replacing

  `recipes`, `keyframes`, `properties`, `fontFaces`, `counterStyles`, and CSS `@function` definitions replaced wholesale, while `tokens` and `globalStyles` merged. A design-system `configure()` followed by an application `configure()` therefore silently dropped the design system's recipes, keyframes, properties, font faces, counter styles, and functions. All of them now merge, with the later call winning on a key conflict — matching what the `functions` documentation already claimed.

  `configure({ polyfills })` gains the `stylesGenerated` guard every sibling option has, and shallow-merges, so an unrelated later `configure({ polyfills: {} })` no longer switches a polyfill off while an explicit `{ functions: false }` still does.

  ### `funcs` → `functions` on the parser surface
  - `ParserOptions.funcs` → `ParserOptions.functions`
  - `StyleParser.setFuncs()` → `StyleParser.setFunctions()`

  ### Removed from the public surface
  - `customFunc`, `getGlobalFuncs`, `resetGlobalFuncs` — use `configure({ functions })`. `getGlobalFuncs()` returned the live mutable internal registry, and writing to it bypassed the parser's cache invalidation, so the write silently never took effect. They remain internally as `customFunction`, `getGlobalParseFunctions`, and `resetGlobalParseFunctions`.
  - `setGlobalPredefinedTokens`, `resetGlobalPredefinedTokens` — use `configure({ replaceTokens })` and `resetConfig()`.
  - `warn`, `deprecationWarning` — internal helpers with no callers.
  - `DEFAULT_PLUGINS` — never consumed by anything, including `configure()`. Passing it to `configure({ plugins })` was a no-op; the default `okhsl`/`okhst` functions are registered by the parser bootstrap, which is unchanged. Also removes the unused `areDefaultFunctionsRegistered()` and `_resetDefaultFunctionsFlag()`.
  - `registerDefaultFunctions` — internal bootstrap helper.
  - `GlobalStyledProps` — an interface whose only member was the `breakpoints` prop already removed as dead.

  The `@tenphi/tasty/core` barrel now lists the `utils/styles` exports explicitly instead of re-exporting the whole module, so internal helpers can no longer leak onto the public surface by accident.

  ### Renamed
  - `CssOptions` → `CSSOptions`, matching the `getCSSText` / `useRawCSS` family. It was newly exported in this major, so this is its first released spelling.

  ### Added
  - `FunctionsConfig` and `ParseFunction` are now exported. They are the declared types of the public `functions` config and plugin fields, so they were impossible to reference.

  ### Fixed
  - The `okhsl` / `okhst` / `createColorFunc` "expected 3 values" warning fired in production and used an `[okhsl]` prefix. It is now development-only and follows the `[Tasty]` convention: `[Tasty] okhsl(): expected 3 values (H S L), got: …`.
  - The "cannot update" warning for `functions` said `function`.
  - `RESERVED_PREFIXES` in the state parser now includes `@font-face`, `@counter-style`, and `@function`, matching the built-in state list.
  - The `useFunction` JSDoc and the `docs/react-api.md` example showed the function being called from a raw inline `style` prop, which bypasses the parser entirely — the `$$name(...)` sugar is never expanded, and under `polyfills.functions` it silently does nothing. Both now show the DSL call.

  ### Guardrails

  A new public-API snapshot test records every export of every `package.json` subpath in `src/__snapshots__/public-api.md`, covering types as well as values. Any change to the published surface now shows up as a reviewable diff.

  `knip` is now correct and runs in CI. It previously declared only test and bench files as entry points, so it could not reason about the published surface at all — which is why the dead exports above went unnoticed.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - ## v3 public API cleanup

  Consolidated breaking changes for the v3 major release. At-rule **styles-object keys stay CSS-spec-faithful** (`@keyframes`, `@property`, `@font-face`, `@counter-style`, `@function`, `@starting`); the `func` injector method stays abbreviated (`function` is a reserved word). Everything else is unified to JS conventions (plural where applicable), dead code is removed, and type-vs-runtime gaps are fixed.

  ### Breaking renames
  - `getCssText()` / `getCssTextForNode()` / `StyleInjector.getCssTextForClasses()` → `getCSSText()` / `getCSSTextForNode()` / `getCSSTextForClasses()` to match the rest of the raw-CSS family (`useRawCSS`, `injectRawCSS`, `getRawCSSText`).
  - Config getters pluralized to match their (already-plural) config keys: `getGlobalFontFace` → `getGlobalFontFaces`, `getGlobalCounterStyle` → `getGlobalCounterStyles`, `getGlobalFunction` → `getGlobalFunctions`.
  - `okhslFunc` / `okhstFunc` → `okhslFunction` / `okhstFunction` (align with the `useFunction` / `FunctionDefinition` family).
  - Next.js zero-runtime wrapper moved: `@tenphi/tasty/next` → `@tenphi/tasty/zero/next` (it already lived under the `zero` namespace; this avoids colliding with `@tenphi/tasty/ssr/next`).

  ### Removed from the public surface
  - `getIsTestEnvironment()` — use `isTestEnvironment()` directly.
  - `hydrateTastyCache()` (deprecated since 2.x) — use `hydrateTastyClasses()`.
  - `setMiddlewareTransferCache()` / `getMiddlewareTransferCache()` — `@internal`-tagged helpers moved off the public `@tenphi/tasty/ssr/astro` export.
  - `clearWriterCache()` — test utility removed from the `@tenphi/tasty/babel-plugin` export (still importable internally).
  - `UseStylesOptions` type alias — `useStyles()` is now typed `Styles | undefined` directly.
  - `PropertyOptions` (the duplicate defined in the injector barrel) — consolidated into a single `PropertyOptions` in `injector/types` (`PropertyDefinition` + `root?`). `UsePropertyOptions` is now an alias of it.
  - `Bucket` enum — un-exported from `@tenphi/tasty/core` (parser-internal).
  - `Props` (`Record<string, any>`) — un-exported; inline `Record<string, any>` at the wrap-overload base.
  - Dead props removed from `BaseProps` / `TastySpecificKeys`: `css`, `block`, `inline`, `breakpoints` (typed but never consumed).

  ### Behavior / type fixes
  - `theme` prop is now implemented: it maps to the `data-theme` attribute on the rendered element (previously it fell through to `otherProps` and was spread raw). Augment `TastyThemeNames` for autocomplete.
  - `isChecked` added to `BaseProps` / `AllBaseProps` (it already worked at runtime via the `is*` pipeline but was missing from the root prop types).
  - `tasty(Component, options)` (wrap overload) no longer leaks factory-only options (`variants`, `elements`, `styleProps`, `modProps`, `tokenProps`) onto the wrapped component as runtime props — they are stripped, matching the element factory.
  - `namePrefix` JSDoc regex corrected to `^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$` (matches the validator).

  ### Additive (still part of this major's API surface)
  - `createServerStyleCollector()` and `createCSSWriter()` factory wrappers are now the canonical entry points for the infrastructure services (the classes remain exported for advanced use).
  - `TastyComponentPropsWithDefaults`, the `tastyDebug` helper types (`DebugOptions`, `CssOptions`, `InspectResult`, `CacheStatus`, `ChunkBreakdown`, `Summary`, `DebugChunkInfo`), and `PropertyOptions` are now exported. The debug-local `ChunkInfo` was renamed `DebugChunkInfo` to avoid colliding with the parser `ChunkInfo`.

### Minor Changes

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - Add support for the CSS `@function` at-rule (custom functions), unify function configuration under a single `functions` key, and add an opt-in `@function` polyfill.

  Define reusable, parameterized CSS functions via the `'@function'` styles key, the `useFunction` hook, or `configure({ functions })`. Functions are defined with `$$name` keys and invoked with the `$$name(...)` sugar (e.g. `marginTop: '$$negative(10px)'`). Parameters and local variables use `$name`, and `result`/defaults/local-var values flow through the Tasty DSL (units, color tokens, auto-calc, fallbacks). Works across client, SSR/RSC, and zero-runtime (`tastyStatic`) modes. Functions are injected once, globally, and never cleaned up (like `@counter-style`). A component-local `@function` definition overrides a global `configure()` definition of the same name.

  **Unified `functions` config (breaking for the previously-shipped `funcs`/`function` keys):** the separate `funcs` (JS parse-time functions) and `function` (declarative CSS functions) config and plugin keys are replaced by a single `functions` map, discriminated by value type — a bare key with a function value is a parse function (`name(...)`), and a `$$name` key with an object value is a CSS `@function` definition (`$$name(...)`). A key whose prefix doesn't match its value type is ignored with a dev-mode warning.

  **`@function` polyfill:** enable `configure({ polyfills: { functions: true } })` to inline every `$$name(...)` call into plain CSS (`calc()`/`var()`/`color-mix()`) at parse time instead of emitting the native `@function` rule. This brings `@function` support to browsers that don't ship the at-rule yet (Firefox/Safari) and works across all rendering modes. Limitations: no native fallback, conditional results are inlined verbatim, typed params/`returns` are dropped, and recursive functions are left untouched.

  Note: native `@function` is an experimental CSS feature; without the polyfill, unsupported browsers safely ignore the rule.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - Custom color functions now work as ordinary plugins with no core special-casing.

  Previously `okhsl`/`okhst` were hardcoded across the style core (parser, `strToRgb`, `resolveToRgbaValues`, `#token.alpha` injection, and the fast-path color check), so a third-party color plugin could not achieve the same integration without editing Tasty itself.

  The core now treats any custom `functions` entry whose output is an already-supported color (`rgb`, `hsl`, `#…`, `oklch`, …) as a first-class color value by delegating back to the parser. All okhsl/okhst special-casing has been removed; they are now ordinary one-liner plugins registered by default (backward compatible — zero-config usage is unchanged).

  New public exports for plugin authors: `createColorFunc` (helper for HSL-style color spaces) and `resolveFunctionColor`. A third-party color plugin is now just:

  ```ts
  const myPlugin = () => ({
    name: 'mycolor',
    functions: { mycolor: (groups) => 'rgb(...)' },
  });
  configure({ plugins: [myPlugin()] });
  ```

  `createColorFunc`'s signature changed from `(name, channelLabel, convert)` to `(name, convert, label?)` — the label is now an optional trailing argument used only to format dev warnings.

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - Add props middleware and global base style props, and make custom style handlers unambiguous.

  **`configure({ propHandlers })`** registers middleware over component props — props in, props out. It is the extension point for props that are _not_ style properties: read a custom prop, strip it so it never reaches the DOM, and fold its meaning into `styles`, `mods`, `tokens`, `variant`, or `as`.

  ```ts
  configure({
    propHandlers: {
      glaze: (props) => {
        const { glaze, ...rest } = props;
        if (!glaze) return rest;

        return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
      },
    },
  });

  <Element glaze="purple" />
  ```

  The map key is the handler's name and, by default, the prop that triggers it — an absent prop costs one property check, not a call. Use `['*', fn]` for an unconditional handler or `[['a', 'b'], fn]` to trigger on any of several props. Handlers run in registration order (plugins first, then direct config), each receiving the previous one's output, and run before any prop is destructured, so a handler can rewrite every tasty prop. Returning nothing is treated as "unchanged" with a development-mode warning, since it is almost always a forgotten `return props`.

  Handlers must be pure and must not mutate their input: style values are cached by object identity, so mutating one in place produces a stale class name and stale CSS. Memoize the styles you build per input value — this also lets the cache key reuse its serialization instead of recomputing it every render.

  Not applicable to zero-runtime mode: `tastyStatic()` takes styles objects, not props, so there is nothing for middleware to run on. Components rendered through `tasty()` are unaffected and get their CSS from the runtime injector as usual. Server and client must register the same handlers, or class names diverge and hydration mismatches — the same requirement as `namePrefix`.

  **`configure({ baseStyleProps })`** exposes style properties as top-level props on **every** tasty component, without each component listing them in `styleProps`:

  ```ts
  configure({ baseStyleProps: ['radius', 'shadow'] });

  <Card radius="1r" shadow />
  ```

  Base style props are now resolved lazily per component and refreshed when the registry changes, so `configure()` may run _after_ your components are defined — previously the prop list was fixed when each `tasty()` factory was created, which happens at module load.

  Type both with module augmentation: `TastyCustomProps` for `propHandlers` keys, and `TastyBaseStylePropNames` (each name set to `true`) for promoted style names, which are then typed exactly like the style they name. Both plugins and `configure()` can supply `propHandlers` and `baseStyleProps`.

  **Plugins can now also supply `properties`, `keyframes`, `fontFaces`, and `counterStyles`.** A plugin whose handler or prop handler emits a custom property usually needs an `@property` declaration alongside it, which previously could only come from `configure()` directly. All four merge with the `configure()` values, with direct config winning on conflict.

  **Custom style handlers are safer and better typed.**
  - A handler whose dependencies mix known and unknown style names now has the unknown ones assigned to the same chunk, so it is invoked **once with all of its dependencies** instead of once per chunk with a subset. Chunks are cached independently on their own style values, so the old behaviour could emit stale CSS. A handler that bridges two _built-in_ chunks warns instead, since fixing that would mean re-chunking built-in styles.
  - Replacing a built-in handler now warns in development and lists what it displaced. Built-in handlers are shared across style names, so `configure({ handlers: { fill } })` also took over `image` and the whole `background-*` family, and `configure({ handlers: { display } })` took down `flow`, `gap`, `hide`, `overflow`, `whiteSpace`, and `textOverflow` — and the displaced names did not go dark, they silently fell back to auto-generated CSS aliases, so `hide: true` began emitting a literal `hide: true` declaration.
  - New `defineHandler(deps, fn)` infers each dependency's type from the dependency list, so a typo in the destructure is a type error rather than a silent `undefined`.
  - New `StyleHandlerProps`, `ResolvedStyleValue`, and `AnyStyleHandler` types. `RawStyleHandler` and `StyleHandler` take an optional props type parameter, and the handler dependency map is now typed as the resolved scalars handlers actually receive rather than a state map — which removes the blanket `@ts-expect-error` the built-in registry needed.
  - `CSSMap` accepts the numeric values built-in handlers already returned (`{ '-webkit-line-clamp': 3 }`), and a handler that returns a camelCase CSS property name now emits a `HANDLER_CAMEL_CASE_KEY` warning in development instead of silently producing a declaration the browser ignores. `--custom-property` names are exempt, being case-sensitive.

  `docs/configuration.md` now documents the handler return shape, the `$` selector-suffix key, that values arrive as raw unparsed DSL strings, the shared-handler groups, and chunk membership.

### Patch Changes

- [#227](https://github.com/tenphi/tasty/pull/227) [`097bfc5`](https://github.com/tenphi/tasty/commit/097bfc5a017de876cf6fda2a5f5c200128a78a4f) Thanks [@tenphi](https://github.com/tenphi)! - Type `fade` as accepting `true`, and document it.

  `fade: true` already worked — an empty value list falls back to `calc(2 * var(--gap))`, a default that follows the gap token and which no explicit value can express (`fade: '2x'` bakes in a static `16px`). But the prop type was `string` only, `docs/ai-agents.md` listed `fade` among the properties that reject `true`, and the ESLint plugin flagged it. Three of the four sources disagreed with the implementation.

  Surfaced by `@cube-dev/ui-kit`, whose `FadeAllDirections` story relies on it.

## 2.11.2

### Patch Changes

- [#251](https://github.com/tenphi/tasty/pull/251) [`0cbd809`](https://github.com/tenphi/tasty/commit/0cbd80936302763cb78e1eb73c9fe78075df3bbd) Thanks [@tenphi](https://github.com/tenphi)! - Fix injected styles never being removed in text-injection mode, so `useGlobalStyles` layered new CSS on top of old CSS instead of replacing it.

  `SheetManager` inserted rules two ways — CSSOM, or by appending to `<style>.textContent` — but only ever deleted through CSSOM. In text mode (auto-enabled in test environments, `configure({ forceTextInjection: true })`, and the fallback whenever `styleElement.sheet` is unavailable) every `dispose()` was a silent no-op against the text, so updating a slot appended another copy of the rules while the stale ones kept matching the selector:

  ```
  useGlobalStyles(':root', { fill: '#red' },   { id: 'theme' })
  useGlobalStyles(':root', { fill: '#blue' },  { id: 'theme' })
  useGlobalStyles(':root', { fill: '#green' }, { id: 'theme' })

  // before: three :root rules stacked      after: one :root rule, green
  ```

  Rule texts are now tracked per sheet in text mode and the element is rebuilt on delete, mirroring how raw CSS already worked. This also makes ref-counted cleanup and GC effective in text mode.

  Also fixed in the same class of bug:
  - `useGlobalStyles` now clears its slot when the new styles render no CSS (previously `{}` left the old rules applied), and its slots are keyed per `root`, so the same selector in two shadow roots no longer evicts the other's rules.
  - `useKeyframes` disposed nothing when a named slot's steps changed, leaking an `@keyframes` rule per change and minting `pulse-tk0`, `pulse-tk1`, … instead of reusing the name. A named slot now holds one injection and keeps its name stable.
  - The client caches behind `useGlobalStyles`, `useRawCSS`, `useKeyframes` and `useCounterStyle` survived `configure()` replacing the global injector, so their change-detection keys suppressed re-injection into the new sheets and their dispose handles pointed at a dead injector. They are now keyed per injector and per root.
  - With an explicit `id`, `useGlobalStyles` and `useRawCSS` were last-write-wins on the client but first-write-wins in SSR/RSC, so an update inside one render pass shipped the old CSS. Slot-keyed entries now replace on the server too; content-hashed keys still only dedup.

## 2.11.1

### Patch Changes

- [#249](https://github.com/tenphi/tasty/pull/249) [`252c1de`](https://github.com/tenphi/tasty/commit/252c1de182f9685094cf16821a05a686aaf280a6) Thanks [@tenphi](https://github.com/tenphi)! - Standardize every console diagnostic on a single `[Tasty] ` prefix. Warnings
  previously went out under six different conventions (`Tasty: `, `[tasty] `,
  `tasty: `, `tastyDebug: `, `[Tasty] `, and no prefix at all), which made tasty
  output impossible to filter reliably in a browser console. Non-fatal diagnostics
  that were still firing in production — the `#current` color-token warning,
  invalid custom style definitions, unparseable function tokens, ignored
  `scrollbar="none"` tokens, and the default pipeline warning handler — are now
  behind `process.env.NODE_ENV !== 'production'` so a bundler strips them from
  production builds; `setWarningHandler` consumers still receive those warnings
  programmatically in production. Real error reporting in the style-sheet manager
  (rule insertion/deletion failures that swallow an exception, and a style element
  failing to attach to the DOM) stays unconditional and just gains the prefix.

## 2.11.0

### Minor Changes

- [#246](https://github.com/tenphi/tasty/pull/246) [`6ae0b6a`](https://github.com/tenphi/tasty/commit/6ae0b6ae941447942588a64849df72b16f046534) Thanks [@tenphi](https://github.com/tenphi)! - `inset`'s `dock` modifier now takes a second value for the spanned sides.

  Values are consumed positionally by the named directions — `inset: '1x 2x left right'` sets left `1x` and right `2x` — so the value _after_ the directional ones now applies to the perpendicular pair a `dock` spans:

  ```
  inset: '2x 4x bottom dock'  ->  inset: auto 32px 16px 32px   (bottom 2x, sides 4x)
  inset: '2x 4x right dock'   ->  inset: 32px 16px 32px auto   (right 2x, top/bottom 4x)
  ```

  With no second value the span keeps reusing the edge's own value, so `inset: 'bottom dock'` and `inset: '2x bottom dock'` are unchanged.

  `dock` is intended for a single edge; combining it with several directions has no well-defined meaning.

## 2.10.0

### Minor Changes

- [#244](https://github.com/tenphi/tasty/pull/244) [`e0c6bd0`](https://github.com/tenphi/tasty/commit/e0c6bd0255cf3c25e1b151533742b4aaee3a24ca) Thanks [@tenphi](https://github.com/tenphi)! - Add single-corner `radius` modifiers and an `inset` `dock` modifier. Both cases previously had no expressible form, which forced authors into raw 4-value box syntax.

  **`radius` now accepts single-corner modifiers** — `top-left`, `top-right`, `bottom-right`, `bottom-left`. A directional modifier addresses the corner _pair_ along an edge (`radius: 'top'` rounds top-left and top-right), so one corner on its own could not be expressed. Previously an unrecognized corner name was silently dropped and the value applied to **every** corner: `radius: '4px top-left'` emitted `border-radius: 4px` instead of only the top-left corner. Now:

  ```
  radius: 'top-right'        ->  border-radius: 0 var(--radius) 0 0
  radius: '4px top-left'     ->  border-radius: 4px 0 0 0
  radius: 'top bottom-right' ->  border-radius: var(--radius) var(--radius) var(--radius) 0
  ```

  The value is optional and defaults to `var(--radius)` (`1r`), matching edge modifiers. Corner modifiers combine with edge modifiers, work with `longhand`, and accept CSS-wide keywords (`radius: 'inherit top-right'`).

  **`inset` now accepts a `dock` modifier** that pins the named edge and spans its full length, applying the value to the two perpendicular sides as well:

  ```
  inset: 'bottom dock'    ->  inset: auto 0 0 0     (bottom-anchored, full width)
  inset: 'right dock'     ->  inset: 0 0 0 auto     (right-anchored, full height)
  inset: '2x bottom dock' ->  inset: auto 16px 16px 16px
  inset: 'dock'           ->  inset: 0
  ```

  Properties opt in via the new `spanModifiers` field on `DirectionalConfig`; only `inset` sets it, so `padding`, `margin` and `scrollMargin` treat `dock` as an unknown modifier and are unchanged.

  No behaviour change for any previously valid input — edge modifiers, shapes (`round`, `ellipse`, `leaf`, `backleaf`), `longhand`, multi-group syntax and individual direction props all emit exactly what they did before.

## 2.9.1

### Patch Changes

- [#233](https://github.com/tenphi/tasty/pull/233) [`5ce5f74`](https://github.com/tenphi/tasty/commit/5ce5f7478d2cafaa979c5378f18b1daaa6cab112) Thanks [@tenphi](https://github.com/tenphi)! - Fix Astro SSR middleware corrupting binary responses. The middleware
  previously decoded every response body as UTF-8 text, mangling non-HTML
  payloads (images, fonts, JSON, etc.) — e.g. PNG bytes served from an OG
  image endpoint. It now inspects the `Content-Type` and passes any
  response that isn't `text/html` (or has no body) through untouched.

## 2.9.0

### Minor Changes

- [#231](https://github.com/tenphi/tasty/pull/231) [`1487bbb`](https://github.com/tenphi/tasty/commit/1487bbb26ecb6ea68a928dbdf27ff1b9770279c6) Thanks [@tenphi](https://github.com/tenphi)! - Add `normal` modifier to `preset` that sets `line-height: normal`, overriding the preset's line-height value.

## 2.8.2

### Patch Changes

- [#229](https://github.com/tenphi/tasty/pull/229) [`4cc27ed`](https://github.com/tenphi/tasty/commit/4cc27eddec63707c0b1724bc44f0ae1a4355ce71) Thanks [@tenphi](https://github.com/tenphi)! - Skip the sRGB round-trip whenever a native CSS color function (`rgb`/`hsl`/`oklch`) already matches the configured output color space. Same-space values are now preserved verbatim instead of being parsed and rebuilt, which:
  - Keeps `var()` / `calc()` channels intact (e.g. `oklch(var(--hue) .2 20)` is no longer NaN'd by `parseFloat`).
  - Preserves mixed-case custom-property names (`var(--myHue)`) — CSS custom properties are case-sensitive and were previously lowercased.
  - Preserves wide-gamut `oklch()` colors that the round-trip would clamp to the sRGB gamut.
  - Avoids redundant work for static values.

  Decomposed color components (`--*-color-{space}`) still normalize static percentage channels to canonical numbers (so `okhsl()` / `okhst()` output stays a valid `<number>+`), while dynamic `var()` / `calc()` channels are kept verbatim.

## 2.8.1

### Patch Changes

- [#226](https://github.com/tenphi/tasty/pull/226) [`5832345`](https://github.com/tenphi/tasty/commit/5832345128ef8abe6ee5d9b3dd281f164ad9e118) Thanks [@tenphi](https://github.com/tenphi)! - Fix named sub-element syntax for vendor-prefixed pseudo-elements.

  The selector-affix tokenizer rejected pseudo-elements starting with a hyphen
  (`::-webkit-slider-thumb`, `::-moz-range-thumb`) because the pseudo token
  pattern required a lowercase letter immediately after `::`. Allow an optional
  leading `-` so vendor pseudo-elements work in `$` affixes like
  `@::-webkit-slider-thumb`.

## 2.8.0

### Minor Changes

- [#223](https://github.com/tenphi/tasty/pull/223) [`602b7da`](https://github.com/tenphi/tasty/commit/602b7da9e5eb0934d1cfdbc8e944ffff5c93e40b) Thanks [@tenphi](https://github.com/tenphi)! - Add `okhstPlugin` for the contrast-uniform OKHST tone color space.

## 2.7.0

### Minor Changes

- [#220](https://github.com/tenphi/tasty/pull/220) [`e9d04ac`](https://github.com/tenphi/tasty/commit/e9d04ac1616098acd07e63a6bc26dbff382c3ec1) Thanks [@tenphi](https://github.com/tenphi)! - Add the `_` fallback floor key and equalize selector specificity with `:where()`.

  A standalone `_` key in a style value map defines a map-wide fallback floor: its
  value **always applies** and is never turned off by higher-priority states,
  which simply layer over it via the cascade. This fixes the CSS
  three-valued-logic hole where a negated `@supports(...)` / container-query
  default branch silently never applies (e.g. `scroll-state` is supported but a
  specific `scroll-state(...)` query is unknown), leaving no rule active. `_` is
  standalone-only — it cannot be combined with state logic (`_ & hovered` is
  ignored with a dev warning) — and it can coexist with the bare `''` default
  (`''` is the negated default, `_` is the always-on floor).

  To make the additive cascade predictable, every stateful selector Tasty
  generates (modifiers, pseudo-classes, `:is()`/`:not()` groups, and
  `@root`/`@parent` context) is now wrapped in `:where(...)` so it carries zero
  specificity. The only specificity anchors are the doubled component class
  (`.tXX.tXX`) and sub-element `[data-element]` attributes; overlapping rules
  resolve purely by source order, which Tasty now emits ascending by priority
  (`@starting-style` last).

  Note: state selectors drop from e.g. `0,3,0` to the class baseline `0,2,0`
  specificity. This is intentional — the doubled class remains the floor — but may
  affect overrides from external CSS that relied on state-selector specificity.

### Patch Changes

- [#220](https://github.com/tenphi/tasty/pull/220) [`3c11119`](https://github.com/tenphi/tasty/commit/3c11119ee1a93dec54a23ee3883d3f915ac68703) Thanks [@tenphi](https://github.com/tenphi)! - Auto-correct and warn on misplaced or redundant default states in style maps.

  The bare default state (`''`) is the lowest-priority state and must be the first
  key in a state map. When it is authored after other states, Tasty now moves it
  to the front and emits a `MISPLACED_DEFAULT_STATE` dev warning — previously it
  silently overrode every state above it because a `TRUE` condition is never
  negated.

  Defining both a `_` fallback floor and a bare `''` default with no other states
  is redundant: the `''` default would always be superseded by the floor. Tasty
  now keeps the `_` value, drops the `''` default, and emits a
  `REDUNDANT_DEFAULT_STATE` dev warning. When other states exist, `_` and `''`
  coexist (one is the always-on floor, the other the negated default).

## 2.6.5

### Patch Changes

- [#212](https://github.com/tenphi/tasty/pull/212) [`08efe45`](https://github.com/tenphi/tasty/commit/08efe45217ceee24cccebbe6f704da1a82968c83) Thanks [@tenphi](https://github.com/tenphi)! - Internal export optimizations to reduce exposure of internal logic.

- [#218](https://github.com/tenphi/tasty/pull/218) [`6e6de33`](https://github.com/tenphi/tasty/commit/6e6de330579571d32c9ed52c375835b95f09d0d9) Thanks [@tenphi](https://github.com/tenphi)! - Fix negation of `@supports`-guarded feature queries. When an `@supports`
  feature query guards a dependent query (e.g. `@supports(container-type:
scroll-state) & @(scroll-state(...))`), the default state is now emitted under
  a bare `@supports (not (...))` fallback instead of a meaningless bare
  `@container (not scroll-state(...))` rule. Previously the default could fail to
  apply in browsers without the feature. `@supports` negation branches now sort
  ahead of other at-rule branches during exclusive expansion; cases without an
  `@supports` guard are unaffected.

## 2.6.4

### Patch Changes

- [#203](https://github.com/tenphi/tasty/pull/203) [`14d0ec2`](https://github.com/tenphi/tasty/commit/14d0ec23c7059974aa82e60c9294657ff489fd52) Thanks [@tenphi](https://github.com/tenphi)! - Fix exponential render time for large state maps that use bracket attribute selectors.

  Style maps combining many mutually-exclusive attribute states (e.g. `[data-variant="processing"] & [data-theme="..."]` across many themes) could take several seconds to render because the engine could not tell that selectors on the same attribute with different values never overlap. Bracket attribute selectors now parse as structured modifiers, so the pipeline recognizes their mutual exclusivity and drops the unnecessary negations between non-overlapping states. The generated CSS is also more compact: each state produces a single clean compound selector, and catch-all/default entries collapse `OR` chains of negations into a single `:not(...)`.

## 2.6.3

### Patch Changes

- [#192](https://github.com/tenphi/tasty/pull/192) [`832cb65`](https://github.com/tenphi/tasty/commit/832cb6521ae475ca71436cca28393610689ed493) Thanks [@tenphi](https://github.com/tenphi)! - Fix cascade order corruption in `mergeEntriesByValue` (style rendering Stage 1b). When a style map contained two non-default states with the same value separated by a state with a different value (e.g. `{ hovered: 'red', pressed: 'blue', disabled: 'red' }`), the early merge would lift the lower-priority entry up to the maximum priority of the group, producing an `:is([data-disabled], [data-hovered])` rule that shadowed `pressed` whenever `[data-hovered]` was set — so `pressed + hovered` together resolved to red instead of blue. Same-value entries are now only merged when the merge is provably safe (no intermediate-priority state could have won in a scenario the merge would block), restoring the authored cascade while preserving the existing dark/high-contrast token deduplication optimization.

- [#194](https://github.com/tenphi/tasty/pull/194) [`dd54644`](https://github.com/tenphi/tasty/commit/dd5464440e192822a224ce6f5a28a3a077ddbd61) Thanks [@tenphi](https://github.com/tenphi)! - Infer the wrapped component's prop API when `as` is a React component in the element-factory form: `tasty({ as: NextLink, ... })` now exposes `NextLink`'s own props (e.g. `href`, `replace`, `prefetch`) on the resulting Tasty component alongside the existing Tasty-specific props. Previously the resulting component was typed as if it rendered a `div` and the wrapped component's prop API was lost. Intrinsic-tag usage (`as: 'div' | 'button' | …`) and the `tasty(Component, options)` wrap form are unchanged.

## 2.6.2

### Patch Changes

- [#190](https://github.com/tenphi/tasty/pull/190) [`e9dc06f`](https://github.com/tenphi/tasty/commit/e9dc06f34a5b456172782568053a7b8a2c67a266) Thanks [@tenphi](https://github.com/tenphi)! - Stop re-attempting (and re-warning about) `@property` injections in engines that don't support them (e.g. jsdom, happy-dom). Failed `@property` attempts are now cached per registry so each property name is tried at most once, and the `[tasty] Browser rejected CSS rule:` dev warning is suppressed for `@property` only when a one-shot per-registry feature probe confirms the engine lacks `@property` support. Warnings still fire for genuinely invalid `@property` definitions in engines that do support the feature.

## 2.6.1

### Patch Changes

- [#188](https://github.com/tenphi/tasty/pull/188) [`0328aa4`](https://github.com/tenphi/tasty/commit/0328aa45f729a32966172931d066df9b14066363) Thanks [@tenphi](https://github.com/tenphi)! - Warn and ignore top-level style keys that start with `:` (e.g. `':hover'`, `'::before'`). Tasty's DSL puts pseudo-states in value maps or under nested-selector keys with an `&` prefix (`'&:hover'`); without `&` such keys previously fell through to a generic style handler and produced malformed CSS. The dev-mode warning explains the supported alternatives and the key is now dropped. Also restores the runtime `[tasty] Browser rejected CSS rule` dev warning, which was inadvertently silenced and is useful for catching exactly this kind of bug in real browsers.

## 2.6.0

### Minor Changes

- [#182](https://github.com/tenphi/tasty/pull/182) [`a8ef75c`](https://github.com/tenphi/tasty/commit/a8ef75ca3748a69eeafe3a5ef965582b12d9df67) Thanks [@tenphi](https://github.com/tenphi)! - Support multiple space-separated modifiers in the `preset` style. Modifiers can now be combined after the slash (e.g. `preset="h2 / strong italic"`, `preset="t2 / strong tight"`) and in the modifier-only shorthand (e.g. `preset="bold italic"`). Existing single-modifier syntax is unchanged.

### Patch Changes

- [#180](https://github.com/tenphi/tasty/pull/180) [`c714552`](https://github.com/tenphi/tasty/commit/c7145529686c957ab0bdf7ca1fb2d680bab9dbae) Thanks [@tenphi](https://github.com/tenphi)! - Skip OR expansion for pure-selector ORs so same-context branches like `:hover | :focus` or `:-webkit-autofill | :autofill` collapse cleanly into `:is(...)` instead of producing dead `:not()` chains. Also warn (dev only) when a state key references unmatchable `:-internal-*` pseudo-classes.

## 2.5.0

### Minor Changes

- [#178](https://github.com/tenphi/tasty/pull/178) [`81a591b`](https://github.com/tenphi/tasty/commit/81a591b7aaf4ceca9c8d2ed03b10c371d1c2e936) Thanks [@tenphi](https://github.com/tenphi)! - Revert the dispatch behaviour introduced in 2.4.0. `tasty(Component, options)`
  again unconditionally uses the prop-forwarding wrap path; the brand-based
  discriminator (`brandTastyComponent` / `isTastyComponent`) and the
  `tasty('div', options)` shorthand are removed.

  To apply styles to a third-party component (Next.js `Link`, `react-router`
  `Link`, Radix primitives, MUI, …) or to a string DOM tag via `className`, use
  the options-only form with `as`:

  ```ts
  const Link = tasty({ as: NextLink, styles: { … } });
  const Span = tasty({ as: 'span',   styles: { … } });
  ```

  This restores 2.3.x semantics for `tasty(Component, …)` and removes the silent
  prop-leakage that 2.4.0 introduced when wrapping plain `forwardRef`/`memo`
  components that were not branded.

## 2.4.0

### Minor Changes

- [#176](https://github.com/tenphi/tasty/pull/176) [`f3ee259`](https://github.com/tenphi/tasty/commit/f3ee259a72d414b1efc652f3d86ccb601c76a058) Thanks [@tenphi](https://github.com/tenphi)! - Allow `tasty(Component, options)` to wrap any React component that forwards
  `className` (Next.js `Link`, `react-router` `Link`, Radix primitives, MUI,
  plain `forwardRef`/`memo`, …). Tasty-produced components are now branded
  internally and continue to use the prop-forwarding path with their full
  `styles`/`mods`/`tokens` pipeline; non-branded components are styled via
  their `className` prop, while Tasty-specific props (`qa`, `qaVal`, `mods`,
  `tokens`, `isDisabled`, `isHidden`, `isChecked`, plus declared
  `styleProps`/`modProps`/`tokenProps`) are consumed by the wrapper and
  converted to `data-*` attributes or CSS custom properties instead of
  leaking to the DOM. As a side benefit, passing a string tag as the first
  argument (`tasty('div', { styles })`) now works too.

### Patch Changes

- [#176](https://github.com/tenphi/tasty/pull/176) [`5180130`](https://github.com/tenphi/tasty/commit/51801305cd08d4193f9ce2f1ccce948c39011954) Thanks [@tenphi](https://github.com/tenphi)! - Allow `styleProps`, `variants`, `modProps`, and `tokenProps` in the
  `tasty(Component, options)` wrap overload — previously these were typed as
  `never`, which forced consumers to cast `Component as any` even though the
  runtime already supported these options.

## 2.3.1

### Patch Changes

- [#169](https://github.com/tenphi/tasty/pull/169) [`d353271`](https://github.com/tenphi/tasty/commit/d353271562f1dadc677808a947ecb65144a15fe9) Thanks [@tenphi](https://github.com/tenphi)! - Runtime injector now registers the decomposed-components companion `@property --{name}-color-{colorSpace}` for every color token, matching the SSR formatter. Previously, `injector.property('#name', …)` (and therefore `markStylesGenerated()` and `DEFAULT_PROPERTIES` like `#white`/`#black`/`#current`) only emitted the `--name-color` rule on the client, while SSR emitted both. Non-SSR consumers (Storybook, CSR apps) can now animate/transition the components variable just like in SSR.

## 2.3.0

### Minor Changes

- [#167](https://github.com/tenphi/tasty/pull/167) [`8395c8e`](https://github.com/tenphi/tasty/commit/8395c8ea17a74e090cd9c5bfecf7ec72362a2d62) Thanks [@tenphi](https://github.com/tenphi)! - Add `namePrefix` option to control the prefix used for every generated identifier (class names, keyframe names, counter-style names). Defaults to `'t'` for the runtime/SSR/RSC paths and `'ts'` for the zero-runtime build path so static-extracted classes can never collide with runtime classes when both are loaded on the same page. Keyframes and counter-styles now consistently use single-letter discriminators (`${prefix}k…`, `${prefix}c…`) so the three name kinds stay visually distinct in devtools (e.g. `tk1a2b3` for a keyframe). Generated keyframe and counter-style names that previously matched `^k\d+$` / `^cs\d+$` are now `^tk\d+$` / `^tc\d+$` by default; class names continue to start with `t…`.

## 2.2.0

### Minor Changes

- [#156](https://github.com/tenphi/tasty/pull/156) [`552c522`](https://github.com/tenphi/tasty/commit/552c522532b5e93465bab6773221dee86f1810ac) Thanks [@tenphi](https://github.com/tenphi)! - Pseudo-element and pseudo-class patterns in the `$` selector affix now require an explicit `&` prefix to attach to the root selector. `$: '::before'` must be written as `$: '&::before'`. Without `&`, pseudo patterns are treated as descendant selectors.

### Patch Changes

- [#154](https://github.com/tenphi/tasty/pull/154) [`b926d10`](https://github.com/tenphi/tasty/commit/b926d10c9007caa3e50e5b74f67caa14a044e7a1) Thanks [@tenphi](https://github.com/tenphi)! - Add explicit return type and narrow `injectScript` stage parameter in `tastyIntegration`.

- [#153](https://github.com/tenphi/tasty/pull/153) [`dbbe9b6`](https://github.com/tenphi/tasty/commit/dbbe9b63a7c74c4364e6a95f20c2ae38f658cd6f) Thanks [@tenphi](https://github.com/tenphi)! - Add #clear color token to the default configuration.

## 2.1.2

### Patch Changes

- [#150](https://github.com/tenphi/tasty/pull/150) [`f8f0285`](https://github.com/tenphi/tasty/commit/f8f02859f91bbe631f8b8be7fc5d9f052c954704) Thanks [@tenphi](https://github.com/tenphi)! - Fix excessive CSS output for compound root states by canonicalizing @media order, removing redundant boolean selectors, improving negation subsumption, and pruning contradicted OR branches.

- [#152](https://github.com/tenphi/tasty/pull/152) [`856a7ba`](https://github.com/tenphi/tasty/commit/856a7ba54ba97075a8428f71db38e4581d79687d) Thanks [@tenphi](https://github.com/tenphi)! - Factor Cartesian-product `:is()` selector groups into independent per-dimension `:is()` groups for more compact CSS output.

## 2.1.1

### Patch Changes

- [#148](https://github.com/tenphi/tasty/pull/148) [`a6fffde`](https://github.com/tenphi/tasty/commit/a6fffde058d4fee43af242fcb5cc70a53fe86d7f) Thanks [@tenphi](https://github.com/tenphi)! - Fix `$: '> SubElementName'` selector affix syntax so that when the trailing element name matches the sub-element's own key it acts as a placeholder rather than triggering a duplicate key injection.

## 2.1.0

### Minor Changes

- [#139](https://github.com/tenphi/tasty/pull/139) [`025dd2c`](https://github.com/tenphi/tasty/commit/025dd2c6c0cb27d5ae7375d396631466cb098f9f) Thanks [@tenphi](https://github.com/tenphi)! - Add Shadow DOM support: `useStyles`, `useGlobalStyles`, and `computeStyles` now accept a `root` option (`Document | ShadowRoot`) to inject styles into a specific shadow root. Styles are injected via `adoptedStyleSheets` when targeting a shadow root, with a shared `ChunkSheetRegistry` for deduplication across multiple shadow roots.

### Patch Changes

- [#139](https://github.com/tenphi/tasty/pull/139) [`4b8bd9d`](https://github.com/tenphi/tasty/commit/4b8bd9d85cafafee41ea1764dee829061ec8e90f) Thanks [@tenphi](https://github.com/tenphi)! - Use happy-dom for injector tests, removing mock CSSStyleSheet and adoptedStyleSheets shims

- [#139](https://github.com/tenphi/tasty/pull/139) [`8f6c8fe`](https://github.com/tenphi/tasty/commit/8f6c8fe22be4f39500020ec377af4e4eaddca351) Thanks [@tenphi](https://github.com/tenphi)! - Make `SheetInfo.sheet` nullable to accurately represent adopted mode where no HTMLStyleElement exists

## 2.0.4

### Patch Changes

- [#137](https://github.com/tenphi/tasty/pull/137) [`0fcb9d9`](https://github.com/tenphi/tasty/commit/0fcb9d975cbd179aacfe0657329d99adfd3acf63) Thanks [@tenphi](https://github.com/tenphi)! - Switch from unbundled to bundled output, reducing publish size by ~74% (from 2.05 MB to ~530 KB) and file count from 313 to 63.

## 2.0.3

### Patch Changes

- [#135](https://github.com/tenphi/tasty/pull/135) [`fa72fe1`](https://github.com/tenphi/tasty/commit/fa72fe190be7dd8cf489cdf05bc730cd0d3f8644) Thanks [@tenphi](https://github.com/tenphi)! - Internal pipeline cleanup: refactor `processStyles` into named per-stage helpers, split `materialize.ts` (types + contradiction detection extracted to `materialize-types.ts` and `materialize-contradictions.ts`), document the actual stage flow in `docs/pipeline.md` and the `index.ts` header (Stage 0 normalization, user-OR vs De Morgan-OR expansion, consensus rule, `@starting-style` cascade ordering), and add tests for container style query rendering, explicit boolean-algebra laws, multi-variable consensus, De Morgan with mixed `@supports`/`@container`, empty-styles, and a known simplification gap for conflicting `@root(schema=…)` attribute values. No behavior change.

## 2.0.2

### Patch Changes

- [#133](https://github.com/tenphi/tasty/pull/133) [`7cd9dbe`](https://github.com/tenphi/tasty/commit/7cd9dbe2eb0844e6c9a31b05a1df9a5b39c73d84) Thanks [@tenphi](https://github.com/tenphi)! - Fix missing state selectors when a non-default state maps to the same value as the default in a style map. Redundant compound state dimensions are now eliminated early in the pipeline.

## 2.0.1

### Patch Changes

- [`bf19368`](https://github.com/tenphi/tasty/commit/bf19368e093f66111b3834305b9383e2015c0f6a) Thanks [@tenphi](https://github.com/tenphi)! - Fix `tastyDebug` sorting of class names. The internal `sortTastyClasses` helper still parsed class names as decimal integers, which silently produced unsorted output for the 2.0.0 base36 hash format (e.g. `t3a5f`). It now sorts lexicographically, restoring stable ordering in `tastyDebug.cache()`, `tastyDebug.summary()`, and related outputs.

## 2.0.0

### Major Changes

- [#123](https://github.com/tenphi/tasty/pull/123) [`f26409e`](https://github.com/tenphi/tasty/commit/f26409e5dfc1efaa1cd81be520cdfb4edae37884) Thanks [@tenphi](https://github.com/tenphi)! - Unified hash-based class names across RSC, SSR, and client. Same cache key now produces the same class name in all environments, enabling cross-environment style deduplication. Replaces the heavy SSRCacheState transfer with a lightweight class-name-list via `window.__TASTY__`.

  **SSR/RSC fixes included:**
  - Fix missing tokens on pages without RSC-rendered tasty components. The `globalThis.__tasty_rsc_internals_emitted__` flag leaked across requests in the same Node.js process; internals (tokens, `@property`, `@font-face`, `@counter-style`) are now emitted exclusively by the SSR collector.
  - Fix duplicate global CSS when RSC and SSR paths both emit internals in Next.js App Router. The SSR collector now skips internals already emitted by the RSC inline-style path.
  - Fix CSS class name collisions during client-side navigation in Next.js App Router. RSC inline styles used sequential counters (`r0`, `r1`, …) that reset on every request; replaced with content-based hashing (djb2) so identical content always maps to the same name.
  - Auto-skip global CSS injection on client when `<style data-tasty-ssr>` is detected, eliminating the need for `typeof window === 'undefined'` guards in `configure()` calls.

  **Internal SSR API changes (not part of the public API):**
  - `SSRCacheState` type removed — replaced by plain `string[]` class lists.
  - `ServerStyleCollector.getCacheState()` replaced by `getRenderedClassNames()`.
  - `window.__TASTY_SSR_CACHE__` replaced by `window.__TASTY__`.
  - `hydrateTastyCache()` deprecated in favor of `hydrateTastyClasses()` (the old function still works as a compat shim).
  - Class name format changed from `t{number}` to `t{base36hash}`.

### Minor Changes

- [#119](https://github.com/tenphi/tasty/pull/119) [`af8bf8a`](https://github.com/tenphi/tasty/commit/af8bf8a966e0655f61ad83565bde538364d0131b) Thanks [@tenphi](https://github.com/tenphi)! - Add `presets` and `globalStyles` options to `configure()`. `presets` is a shorthand for `generateTypographyTokens()` that merges generated tokens under explicit `tokens`. `globalStyles` is a `Record<string, Styles>` that applies Tasty styles to arbitrary CSS selectors across all rendering modes. Both options are also available in plugins and zero-runtime config. Typography preset fields now accept state maps for responsive/theme-aware values.

### Patch Changes

- [#119](https://github.com/tenphi/tasty/pull/119) [`8a7a342`](https://github.com/tenphi/tasty/commit/8a7a342f8c456c80dd35da3c882eb566f5255f28) Thanks [@tenphi](https://github.com/tenphi)! - Derive `TastyZeroConfig` from `TastyConfig` via `Omit` to keep the two types in sync automatically. This also widens `TastyZeroConfig` to accept `colorSpace`, `properties`, and `boolean` values in `replaceTokens` — options that were previously only available in the runtime config.

- [#123](https://github.com/tenphi/tasty/pull/123) [`841767c`](https://github.com/tenphi/tasty/commit/841767c5b382bdf085e9a2c7fad8741dc43789b8) Thanks [@tenphi](https://github.com/tenphi)! - Fix overlapping and duplicate CSS selectors produced by the condition simplifier.
  - Fix overlapping selectors when default and custom-state token values coincide but other state values differ.
  - Fix overlapping selectors for compound state tokens by adding consensus resolution and making inner OR branches exclusive during CSS materialization.
  - Fix complementary factoring for compound state conditions, eliminating duplicate selectors when token values match across state combinations.
  - Eliminate duplicate token CSS rules when multiple states map to the same value. Tokens now generate a single rule instead of redundant duplicates. Also fixes absorption law so `A | (A & B)` correctly simplifies to `A` regardless of condition complexity.

- [#119](https://github.com/tenphi/tasty/pull/119) [`a642337`](https://github.com/tenphi/tasty/commit/a642337c7a7cf804b1474aa482868e7a3a094d5a) Thanks [@tenphi](https://github.com/tenphi)! - Change default `letterSpacing` in typography presets from `'0'` to `'normal'`. The previous default could override inherited letter-spacing; `'normal'` matches the browser default.

## 1.5.4

### Patch Changes

- [#117](https://github.com/tenphi/tasty/pull/117) [`186d305`](https://github.com/tenphi/tasty/commit/186d305f2909bb3e56783f689ece09ac90044456) Thanks [@tenphi](https://github.com/tenphi)! - Fix SSR style loss in Next.js static export by using React context for collector discovery instead of globalThis

## 1.5.3

### Patch Changes

- [#115](https://github.com/tenphi/tasty/pull/115) [`75585fc`](https://github.com/tenphi/tasty/commit/75585fcb85cf9c1d8df1f13dd9bbccd7a0be1e97) Thanks [@tenphi](https://github.com/tenphi)! - Keep Astro SSR middleware style collection active while the response body stream is consumed, so styles from lazily rendered components are included.

- [#115](https://github.com/tenphi/tasty/pull/115) [`5c670b5`](https://github.com/tenphi/tasty/commit/5c670b5e9c33e70e73e9f68d06b5a9015d5a5217) Thanks [@tenphi](https://github.com/tenphi)! - Mirror global config (tokens, font-face, counter-style, properties) to globalThis so SSR collectors in separate module graphs (e.g. Astro middleware) can read it.

## 1.5.2

### Patch Changes

- [#113](https://github.com/tenphi/tasty/pull/113) [`547451d`](https://github.com/tenphi/tasty/commit/547451d2b1409c70fe5ee01c4925861307231a86) Thanks [@tenphi](https://github.com/tenphi)! - Fix Astro SSR middleware by buffering the response body so styles are collected when HTML is streamed. Improve parsing of nested parentheses in `@supports`, `@root`, `@parent`, `@own`, and `@(...)` state keys.

## 1.5.1

### Patch Changes

- [#111](https://github.com/tenphi/tasty/pull/111) [`0544f16`](https://github.com/tenphi/tasty/commit/0544f16d3f609ed7922e88dea096289a81b56b1e) Thanks [@tenphi](https://github.com/tenphi)! - Share SSR AsyncLocalStorage and collector getter on `globalThis` so Astro and similar setups with split module graphs see one collector.

## 1.5.0

### Minor Changes

- [#109](https://github.com/tenphi/tasty/pull/109) [`d084195`](https://github.com/tenphi/tasty/commit/d084195352b859ea64fe6e07d78bd2dad0b56e33) Thanks [@tenphi](https://github.com/tenphi)! - Add Astro Integration API (`tastyIntegration()`) with three-tier support: zero-setup for static pages, optimized static without client JS (`islands: false`), and full island hydration (default). Split client hydration into `@tenphi/tasty/ssr/astro-client`. Middleware now uses streaming `TransformStream` instead of buffering the full response.

- [#110](https://github.com/tenphi/tasty/pull/110) [`b52bad7`](https://github.com/tenphi/tasty/commit/b52bad7952e60c2a121f54f3c64bfaae539f0417) Thanks [@tenphi](https://github.com/tenphi)! - Make all style functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`) hook-free and compatible with React Server Components. Add RSC inline support via shared per-request cache. Add `id` option to `useRawCSS` and `useGlobalStyles` for update tracking. Extract `getStyleTarget()` helper to DRY up SSR/RSC/client detection. Add deps-based factory caching to `useKeyframes` and `useRawCSS`. Remove unused factory overload from `useCounterStyle`.

  **Breaking behavior change:** `useGlobalStyles` and `useRawCSS` no longer clean up injected styles on component unmount. Styles are now permanent once injected. For dynamic styles that change over the component lifecycle, use the `id` option to enable update tracking — when styles change for the same `id`, the previous injection is replaced.

- [#107](https://github.com/tenphi/tasty/pull/107) [`9fbd328`](https://github.com/tenphi/tasty/commit/9fbd328c63f7c0ee1e6e5e35179c605b102b12bc) Thanks [@tenphi](https://github.com/tenphi)! - Simplified the injector garbage collector to a touch-count-driven mechanism.

  **Breaking changes to GC API:**
  - Removed `maybeGC()` — GC is now auto-scheduled by touch count via `requestIdleCallback`
  - Removed `gc()` options: `baseMaxAge`, `cacheCapacity` — replaced with `gc({ force?: boolean })`
  - Replaced `GCConfig` fields (`auto`, `baseMaxAge`, `cooldown`, `autoInterval`, `cacheCapacity`) with `touchInterval` and `capacity`
  - Removed `StyleUsage.hitCount` — only `lastTouchedAt` is tracked

  **New behavior:**
  - Every `touchInterval` touches (default: 1000), GC is scheduled via `requestIdleCallback`
  - GC evicts the oldest unused styles when their count exceeds `capacity` (default: 1000); actively referenced styles don't count against the limit
  - `gc({ force: true })` bypasses the capacity threshold and removes ALL unused styles
  - No timers, no scoring math — activity-proportional triggering with oldest-first eviction

### Patch Changes

- [#109](https://github.com/tenphi/tasty/pull/109) [`8cacca3`](https://github.com/tenphi/tasty/commit/8cacca386756fbe30d7d689eaed2231ee61791ab) Thanks [@tenphi](https://github.com/tenphi)! - Fix Astro streaming middleware: strip Content-Length header after injection, propagate upstream errors instead of silently truncating, remove dead hydrateTastyCache re-export.

## 1.4.2

### Patch Changes

- [#104](https://github.com/tenphi/tasty/pull/104) [`2f4576e`](https://github.com/tenphi/tasty/commit/2f4576ee665212de48253ae558498ec91f38e9b5) Thanks [@tenphi](https://github.com/tenphi)! - Relax `filterBaseProps` generic constraint from `Record<string, unknown>` to `object` so composed prop types (built from `Omit`/intersections) are accepted without requiring a string index signature.

## 1.4.1

### Patch Changes

- [#102](https://github.com/tenphi/tasty/pull/102) [`0a3a431`](https://github.com/tenphi/tasty/commit/0a3a431c01c5a838958d0ebc4f63539c54fd4d2b) Thanks [@tenphi](https://github.com/tenphi)! - Make `filterBaseProps` generic so callers can pass strongly-typed props without casting; return `Partial<T>` to preserve value types.

## 1.4.0

### Minor Changes

- [#101](https://github.com/tenphi/tasty/pull/101) [`e3847c1`](https://github.com/tenphi/tasty/commit/e3847c1e4629b74cec5b214c91acf1ed42b21de5) Thanks [@tenphi](https://github.com/tenphi)! - Add popularity-aware garbage collector for unused styles. Tracks per-className usage with DOM safety guard — styles visible in the DOM are never evicted. Exposes `gc()`, `maybeGC()`, and `touch()` APIs, with optional automatic background sweep via `configure({ gc: { auto: true } })`. Removes old dead-code auto-cleanup pipeline.

### Patch Changes

- [#99](https://github.com/tenphi/tasty/pull/99) [`b183c93`](https://github.com/tenphi/tasty/commit/b183c93d65c0702b35a8c8f06b85176937675fda) Thanks [@tenphi](https://github.com/tenphi)! - Remove `TastySSRContext` React context from SSR pipeline. All hooks now discover the SSR collector via the same global getter used by `computeStyles()`, eliminating the need for a React context Provider in `TastyRegistry`. This simplifies the SSR architecture to a single collector discovery mechanism.

## 1.3.0

### Minor Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`3d06dba`](https://github.com/tenphi/tasty/commit/3d06dba9050487291c410920f0540f9548e56f9a) Thanks [@tenphi](https://github.com/tenphi)! - Make tasty() components hook-free and compatible with React Server Components. Styles are now computed synchronously via `computeStyles()`, removing the need for `'use client'` directives. SSR collectors are discovered via AsyncLocalStorage. Removes dead code: `stringifyTokens`, top-level `allocateClassName`, and `trackRef` wrappers.

- [#95](https://github.com/tenphi/tasty/pull/95) [`310e08f`](https://github.com/tenphi/tasty/commit/310e08fbf6f7e2a317b228f89ad94446d50c28a6) Thanks [@tenphi](https://github.com/tenphi)! - Add `tokenProps` option to `tasty()` for exposing token keys as top-level component props. Supports array form (with `Color` suffix convention for color tokens) and object form (explicit `$`/`#` mapping).

### Patch Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`7eae685`](https://github.com/tenphi/tasty/commit/7eae685ef8346e601c7215c4e6a769e8222fb835) Thanks [@tenphi](https://github.com/tenphi)! - Add RSC inline style emission — tasty() components now render correctly as React Server Components by emitting inline `<style>` tags when no SSR collector or DOM is available.

- [#98](https://github.com/tenphi/tasty/pull/98) [`4adfd20`](https://github.com/tenphi/tasty/commit/4adfd2032c293859d1b68e424246eb9d7f407c55) Thanks [@tenphi](https://github.com/tenphi)! - Make internal properties overridable via `configure({ properties })` by merging user properties on top of defaults. Add `#clear` (transparent) and `#border` (rgb(0 0 0)) color tokens.

## 1.2.0

### Minor Changes

- [#94](https://github.com/tenphi/tasty/pull/94) [`ef3adef`](https://github.com/tenphi/tasty/commit/ef3adefee0ec4d87cc1d936f9ea5d7ce237ffe53) Thanks [@tenphi](https://github.com/tenphi)! - Add `longhand` modifier to force longhand CSS output for radius, padding, margin, scroll-margin, inset, and border style handlers.

- [#92](https://github.com/tenphi/tasty/pull/92) [`f1bf654`](https://github.com/tenphi/tasty/commit/f1bf6544c0f2881326ba804c6e49d1bdd01e9cc8) Thanks [@tenphi](https://github.com/tenphi)! - Overhaul style handler system with CSS-wide keyword support, directional factory, unified placement, and new scrollMargin style.
  - All style handlers now accept CSS-wide keywords (`initial`, `inherit`, `revert`, `unset`, `revert-layer`) where semantically valid
  - New `scrollMargin` style with full directional, block/inline, and priority support
  - Unified `placementStyle` handler replaces separate `align`, `justify`, and `place` with hierarchical priority (longhands override shorthands)
  - Shared directional factory eliminates code duplication across `padding`, `margin`, `inset`, and `scrollMargin`
  - Standardized handler return types to `null` for no-output
  - Fixed `preset` fontStyle handling for non-inherit CSS-wide keywords

- [#88](https://github.com/tenphi/tasty/pull/88) [`a0b1a05`](https://github.com/tenphi/tasty/commit/a0b1a05cda077823cbd40fced85477b986340c95) Thanks [@tenphi](https://github.com/tenphi)! - Add `mode: 'inject'` option to the Babel plugin. In inject mode, CSS is embedded inline in JS and injected at runtime via a tiny injector (`@tenphi/tasty/static/inject`), making `tastyStatic` calls self-contained. Ideal for reusable components and extensions.

### Patch Changes

- [#90](https://github.com/tenphi/tasty/pull/90) [`270ab75`](https://github.com/tenphi/tasty/commit/270ab75185b24233930b2e77b26235fd93f3bf70) Thanks [@tenphi](https://github.com/tenphi)! - Add `inherit` support for the `radius` style property. Standalone `radius="inherit"` outputs `border-radius: inherit`. With directional modifiers (e.g. `radius="inherit right"`), longhand properties are used since CSS-wide keywords cannot be mixed with other values.

## 1.1.0

### Minor Changes

- [#71](https://github.com/tenphi/tasty/pull/71) [`daa6704`](https://github.com/tenphi/tasty/commit/daa6704c869e5edf961cf42cf1e9c49fed365f2b) Thanks [@tenphi](https://github.com/tenphi)! - Switch preset modifier syntax from space-separated (`h2 strong`) to slash-separated (`h2 / strong`). Mod-only shorthand like `preset="bold"` is supported (equivalent to `inherit / bold`).

## 1.0.0

### Major Changes

- [`a25af0b`](https://github.com/tenphi/tasty/commit/a25af0bd75b08c85fbda9f25a948dbc8356a82fc) Thanks [@tenphi](https://github.com/tenphi)! - Promote to stable 1.0.0 release.

## 0.17.1

### Patch Changes

- [#68](https://github.com/tenphi/tasty/pull/68) [`9dd1e81`](https://github.com/tenphi/tasty/commit/9dd1e81afd6fdca6f36e9fe52da85a49c0fd9879) Thanks [@tenphi](https://github.com/tenphi)! - Preserve canonical casing for CSS transform function names (e.g. `translateX`, `scaleY`) in parser output instead of lowercasing them.

## 0.17.0

### Minor Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`2b8620a`](https://github.com/tenphi/tasty/commit/2b8620ab70ffd76f8e0f3ac809ce9408b4c2f5e2) Thanks [@tenphi](https://github.com/tenphi)! - Remove `--line-height` CSS custom property from presets and drop the `lh` custom unit in favor of the native CSS `lh` unit.

### Patch Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`4dbcdea`](https://github.com/tenphi/tasty/commit/4dbcdea94955e0b1358c0b44e7d63bb0486fcc6f) Thanks [@tenphi](https://github.com/tenphi)! - Remove unused `--font-style` CSS custom property from preset style output.

## 0.16.1

### Patch Changes

- [#64](https://github.com/tenphi/tasty/pull/64) [`1372f31`](https://github.com/tenphi/tasty/commit/1372f31f038e9e06b6ff562aad9473386dba3dc7) Thanks [@tenphi](https://github.com/tenphi)! - Nest `@starting-style` inside selector rules instead of wrapping as an outer at-rule. Fixes complex styles not applying `@starting-style` correctly.

## 0.16.0

### Minor Changes

- [#59](https://github.com/tenphi/tasty/pull/59) [`55eadac`](https://github.com/tenphi/tasty/commit/55eadac85a885138c10aa876697c51e79fbf4eab) Thanks [@tenphi](https://github.com/tenphi)! - Rename default font CSS custom properties: `--font` → `--font-sans`, `--monospace-font` → `--font-mono` to align with Tailwind/Next.js conventions.

- [#59](https://github.com/tenphi/tasty/pull/59) [`6ceb4cf`](https://github.com/tenphi/tasty/commit/6ceb4cf2495d0aa02ef01b7d5452af6024db3c06) Thanks [@tenphi](https://github.com/tenphi)! - Add @font-face and @counter-style at-rule support via `useFontFace` / `useCounterStyle` hooks, global `configure()` options, injector methods, SSR collection, and zero-runtime extraction.

### Patch Changes

- [#63](https://github.com/tenphi/tasty/pull/63) [`beaf6ce`](https://github.com/tenphi/tasty/commit/beaf6ce89148b8efdba415123337d3cac9a76c2d) Thanks [@tenphi](https://github.com/tenphi)! - Remove custom `fs` unit and `--font-size` CSS variable from preset output. Use native CSS `em` unit instead.

- [#62](https://github.com/tenphi/tasty/pull/62) [`a27dede`](https://github.com/tenphi/tasty/commit/a27dedeb1b619d8f0843756c2808c3533152282c) Thanks [@tenphi](https://github.com/tenphi)! - Replace INTERNAL_TOKENS `:root` injection with `@property` font-stack fallbacks and CSS `var()` defaults

## 0.15.3

### Patch Changes

- [`a68b132`](https://github.com/tenphi/tasty/commit/a68b1320db8a1523d7c6a388f9700217bcc4c6ee) Thanks [@tenphi](https://github.com/tenphi)! - Fix `configure()` unconditionally resetting `colorSpace` to `'oklch'` on every call, even when `colorSpace` is not provided. Now `colorSpace` follows the same merge semantics as other config options — it is only changed when explicitly passed.

## 0.15.2

### Patch Changes

- [#56](https://github.com/tenphi/tasty/pull/56) [`955caa9`](https://github.com/tenphi/tasty/commit/955caa9e917f86880d462a29b16ac997b2be515c) Thanks [@tenphi](https://github.com/tenphi)! - Fix type error where JSX elements were not assignable as children of tasty components due to `ResolveModProps` producing a catch-all index signature and `AllHTMLAttributes` intersection narrowing tag-specific attribute types.

- [#58](https://github.com/tenphi/tasty/pull/58) [`c89dc3e`](https://github.com/tenphi/tasty/commit/c89dc3e0e03ca8a21f89bb6b2cff331427c38ff0) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack: prevent non-contributing files from overwriting `tasty.css` with tokens-only content.

## 0.15.1

### Patch Changes

- [#55](https://github.com/tenphi/tasty/pull/55) [`24ae87b`](https://github.com/tenphi/tasty/commit/24ae87b4254a6abefa3bd39aa876fb1fc21d9529) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack by persisting CSSWriter across per-file Babel invocations.

- [#53](https://github.com/tenphi/tasty/pull/53) [`107c1bc`](https://github.com/tenphi/tasty/commit/107c1bc060a6508e9dff686515d5c08dd91aed1f) Thanks [@tenphi](https://github.com/tenphi)! - Group design tokens with the same state map into a single CSS rule to reduce output size.

## 0.15.0

### Minor Changes

- [#51](https://github.com/tenphi/tasty/pull/51) [`d2dc330`](https://github.com/tenphi/tasty/commit/d2dc3307bc7c01e2d4e3e9a310facaf267b96d81) Thanks [@tenphi](https://github.com/tenphi)! - Add `modProps` option to `tasty()` for exposing modifier keys as typed component props. Supports array form and object form with type descriptors (`Boolean`, `String`, `Number`, enum arrays) for full TypeScript autocomplete. Mod props merge with `mods` (mod props take precedence).

## 0.14.2

### Patch Changes

- [#49](https://github.com/tenphi/tasty/pull/49) [`63bb6ec`](https://github.com/tenphi/tasty/commit/63bb6ecc69031bc72a83d66e25786f90cc1398a8) Thanks [@tenphi](https://github.com/tenphi)! - Fix sub-element `$` selector affix for bare HTML tag names: `$: "h1"` now produces `{root} h1` instead of `{root} h1 [data-element="..."]`. Add support for the `*` universal selector in affix patterns.

## 0.14.1

### Patch Changes

- [#47](https://github.com/tenphi/tasty/pull/47) [`f5c237f`](https://github.com/tenphi/tasty/commit/f5c237f8aca633db5fd364eab2364def3e083367) Thanks [@tenphi](https://github.com/tenphi)! - Improve color style types: extract reusable `ColorValue` type, add `hsl()`, `okhsl()`, `oklch()` autocomplete hints, remove deprecated `rgba()`, document double-color fill syntax.

## 0.14.0

### Minor Changes

- [#43](https://github.com/tenphi/tasty/pull/43) [`2be334c`](https://github.com/tenphi/tasty/commit/2be334c5b60ab934496dab834e4a862e0ace2c3c) Thanks [@tenphi](https://github.com/tenphi)! - Add configurable color space for decomposed color token companion variables (`configure({ colorSpace })`) with `oklch` as the new default.

  **Breaking:** The default companion variable suffix changed from `-rgb` to `-oklch`. Any external CSS referencing `--name-color-rgb` variables directly will need to either:
  - Set `configure({ colorSpace: 'rgb' })` to restore the previous behavior, or
  - Update references to use `--name-color-oklch` instead.

  Also unifies color conversion with shared OKHSL/sRGB math, improves OKHSL plugin and token handling, and updates related docs.

### Patch Changes

- [#46](https://github.com/tenphi/tasty/pull/46) [`7b4917f`](https://github.com/tenphi/tasty/commit/7b4917fcb23b920bd2b77351112144ad954740af) Thanks [@tenphi](https://github.com/tenphi)! - Update runtime benchmark numbers and add practical performance summary to README.

- [#45](https://github.com/tenphi/tasty/pull/45) [`c6809fd`](https://github.com/tenphi/tasty/commit/c6809fdf08e227de805a6fb6f78708e2d1290c79) Thanks [@tenphi](https://github.com/tenphi)! - Refactor tastyDebug: reduce API to 8 methods, log by default (use `{ raw: true }` to suppress), add rule counts to summary/inspect, add `{ source: true }` for original CSS inspection, simplify prettifyCSS.

- [#43](https://github.com/tenphi/tasty/pull/43) [`e29d47e`](https://github.com/tenphi/tasty/commit/e29d47e7614673bb3b1b0c1b81ca4f0658ba95bf) Thanks [@tenphi](https://github.com/tenphi)! - Fix alpha channel being stripped during color space conversion, restoring transparent color tokens for fade masks and other styles.

- [#43](https://github.com/tenphi/tasty/pull/43) [`5f1ce82`](https://github.com/tenphi/tasty/commit/5f1ce82d4b80e20f2f19460cebdab9605952c8a5) Thanks [@tenphi](https://github.com/tenphi)! - Support CSS named colors (e.g. `purple`, `coral`) as color token values without emitting parse warnings.

## 0.13.1

### Patch Changes

- [#40](https://github.com/tenphi/tasty/pull/40) [`cbe5db3`](https://github.com/tenphi/tasty/commit/cbe5db38718eba80437f6521cda86db801df8c94) Thanks [@tenphi](https://github.com/tenphi)! - Auto-inject generated CSS in zero-runtime mode

  The Babel plugin now automatically replaces `@tenphi/tasty/static` imports with an import of the generated CSS file, eliminating the need to manually add `import '@/public/tasty.css'` in layout files. An empty CSS stub is created before the first build to avoid resolution errors on fresh clones. Controlled via the `injectImport` option (defaults to `true`).

- [#42](https://github.com/tenphi/tasty/pull/42) [`75b5fa0`](https://github.com/tenphi/tasty/commit/75b5fa02d49d58ed85ebf6c71889d5a1efc20cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize CSS selectors: merge OR branches into `:is()`/`:not()` groups for `@root`, `@own`, and base modifier/pseudo conditions; sort conditions for canonical output; unify `ParentGroup` with `SelectorGroup`.

## 0.13.0

### Minor Changes

- [`7270a67`](https://github.com/tenphi/tasty/commit/7270a67394696b0efd8a62f69ba28ee9c74ffc85) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).
  - Set `experimental.turbopackUseBuiltinBabel: true` in the returned config to silence the manual babel-loader warning while preserving compatibility with user `.babelrc` configs.

## 0.12.0

### Minor Changes

- [#37](https://github.com/tenphi/tasty/pull/37) [`c049bfd`](https://github.com/tenphi/tasty/commit/c049bfd7025ab8709b2296921f0fb802f597b0de) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).

## 0.11.0

### Minor Changes

- [#36](https://github.com/tenphi/tasty/pull/36) [`39b2d4d`](https://github.com/tenphi/tasty/commit/39b2d4d721d7cd0bdf220e0da4838d37d6f93acf) Thanks [@tenphi](https://github.com/tenphi)! - Remove predefined design-system tokens (colors, sizes, spacing, shadows, layout, base) from the package. These tokens belong to consuming design systems (e.g. `@cube-dev/ui-kit`), not to the styling engine itself.

  The `TypographyPreset` interface and `generateTypographyTokens()` utility remain available. Built-in CSS properties (`$gap`, `$radius`, `$border-width`, `$outline-width`, `$transition`, `$sharp-radius`, `$bold-font-weight`, `#white`, `#black`) in `INTERNAL_PROPERTIES` are unaffected.

- [#36](https://github.com/tenphi/tasty/pull/36) [`ed929cc`](https://github.com/tenphi/tasty/commit/ed929cc48f14c6fce5d191c6480d30ab234adec3) Thanks [@tenphi](https://github.com/tenphi)! - Refactor token system: `configure({ tokens })` now injects CSS custom properties on `:root` with state map support

  **Breaking changes:**
  - `configure({ tokens })` no longer performs parse-time substitution. Instead, tokens are injected as CSS custom properties on `:root` when the first style is rendered. Token values are parsed through the Tasty DSL and support state maps for responsive/theme-aware values.
  - The old parse-time substitution behavior is now available via `configure({ replaceTokens })`.
  - `TYPOGRAPHY_PRESETS` has been removed. Use `generateTypographyTokens()` with your own presets instead.
  - `generateTypographyTokens()` now requires a `presets` argument (no longer has a default).

  **Migration guide:**

  ```ts
  // Before
  configure({
    tokens: { $spacing: '2x', '#accent': '#purple' },
  });

  // After — for parse-time substitution (same behavior as before)
  configure({
    replaceTokens: { $spacing: '2x', '#accent': '#purple' },
  });

  // After — for :root CSS custom properties (new recommended approach)
  configure({
    tokens: {
      $gap: '8px',
      '#primary': {
        '': '#purple',
        '@dark': '#light-purple',
      },
    },
  });
  ```

### Patch Changes

- [`6a7972a`](https://github.com/tenphi/tasty/commit/6a7972a9933127f824f9395ecc4483187bff6952) Thanks [@tenphi](https://github.com/tenphi)! - Move `jiti` from `dependencies` to optional `peerDependencies` since it is only needed by the Next.js zero-runtime wrapper (`@tenphi/tasty/next`). Document requirements for SSR and zero-runtime entry points.

## 0.10.1

### Patch Changes

- [`ff3cdf8`](https://github.com/tenphi/tasty/commit/ff3cdf86abacd2688d6862504c29471f15d66498) Thanks [@tenphi](https://github.com/tenphi)! - Add name-based `--*-opacity` suffix rule to `autoPropertyTypes`: custom properties ending with `-opacity` are now automatically typed as `<number> | <percentage>` with initial value `0`, enabling smooth CSS transitions for opacity values.

## 0.10.0

### Minor Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`d5bec8b`](https://github.com/tenphi/tasty/commit/d5bec8b91a60e183033a4829dd23ac683f927037) Thanks [@tenphi](https://github.com/tenphi)! - Add server-side rendering (SSR) support with zero-cost client hydration. New entry points: `@tenphi/tasty/ssr`, `@tenphi/tasty/ssr/next`, `@tenphi/tasty/ssr/astro`. Next.js App Router (`TastyRegistry`), Astro (`tastyMiddleware`), and generic framework integration via `ServerStyleCollector`, `TastySSRContext`, `runWithCollector`, and `hydrateTastyCache`. Requires React 19+.

### Patch Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`f39678d`](https://github.com/tenphi/tasty/commit/f39678d3071979d5847aea067a349bd97fcfd806) Thanks [@tenphi](https://github.com/tenphi)! - Upgrade auto-inferred `@property` types: length and percentage values now register as `<length-percentage>` instead of separate `<length>`/`<percentage>`, enabling smooth transitions between mixed units. Add name-based inference for `--*-line-height` properties as `<number> | <length-percentage>`.

## 0.9.0

### Minor Changes

- [#31](https://github.com/tenphi/tasty/pull/31) [`5852321`](https://github.com/tenphi/tasty/commit/5852321733f97170a4d6cb5b62b898d8afde22a3) Thanks [@tenphi](https://github.com/tenphi)! - Simplify scrollbar style handler to use standard CSS properties only (`scrollbar-width`, `scrollbar-color`, `scrollbar-gutter`), removing all `::-webkit-scrollbar-*` pseudo-element logic and the `styled` modifier.

## 0.8.0

### Minor Changes

- [#28](https://github.com/tenphi/tasty/pull/28) [`cf339c4`](https://github.com/tenphi/tasty/commit/cf339c44943c6efe3d4d11910811f04aed00e79f) Thanks [@tenphi](https://github.com/tenphi)! - Consolidate `@parent()` OR branches into a single `:is()`/`:not()` wrapper with comma-separated selector arguments instead of expanding to separate selectors.

- [#28](https://github.com/tenphi/tasty/pull/28) [`361b5a1`](https://github.com/tenphi/tasty/commit/361b5a10518cd95148bb857612e90795a6f0a124) Thanks [@tenphi](https://github.com/tenphi)! - Add support for `:is()`, `:has()`, `:not()`, and `:where()` pseudo-classes in state keys with automatic element name transformation and `:not()` normalization.

## 0.7.1

### Patch Changes

- [#26](https://github.com/tenphi/tasty/pull/26) [`bbb1e4b`](https://github.com/tenphi/tasty/commit/bbb1e4b0bcaaf02ba3ea6f105339022e2f6bb682) Thanks [@tenphi](https://github.com/tenphi)! - Fix `@property` type inference for bare zero values. A value of `0` is ambiguous in CSS (could be `<length>`, `<angle>`, `<percentage>`, etc.), so it is no longer inferred as `<number>`. This prevents incorrect `@property` registrations that would reject subsequent typed values like `10px`.

## 0.7.0

### Minor Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`9941b40`](https://github.com/tenphi/tasty/commit/9941b40895c771691cbf1bfe28245c6d237de7a3) Thanks [@tenphi](https://github.com/tenphi)! - Auto-infer CSS @property types from custom property values. Supports `<number>`, `<length>`, `<angle>`, `<percentage>`, `<time>`, and `<color>` with deferred var() chain resolution. Controlled by `autoPropertyTypes` config flag (default: true). Adds named CSS color support to `strToRgb`.

### Patch Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`871841f`](https://github.com/tenphi/tasty/commit/871841f47c88dd6df705275f39a633c25fb17cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize @property auto-inference: skip non-custom-property declarations early, bypass token parsing indirection, remove color value detection and type mismatch validation overhead.

- [#24](https://github.com/tenphi/tasty/pull/24) [`cb219ee`](https://github.com/tenphi/tasty/commit/cb219eed6cdcc9b85b3306c7faa2e44665ef69df) Thanks [@tenphi](https://github.com/tenphi)! - Support two-color fill alongside background image by combining both layers in background-image.

## 0.6.0

### Minor Changes

- [#21](https://github.com/tenphi/tasty/pull/21) [`2546c41`](https://github.com/tenphi/tasty/commit/2546c4151a60194eac115e13cc07bcee00ea0636) Thanks [@tenphi](https://github.com/tenphi)! - Add extend-mode state maps: base styles with state maps lacking a `''` key are now applied after variant merge, allowing shared state overrides across all variants.

## 0.5.4

### Patch Changes

- [#18](https://github.com/tenphi/tasty/pull/18) [`52e4fc3`](https://github.com/tenphi/tasty/commit/52e4fc37955c9dd361bee56d9987df85aaa03406) Thanks [@tenphi](https://github.com/tenphi)! - Improve pipeline internals: add XOR chain-depth guard, consolidate duplicated deduplication/superset/absorption functions, ensure deterministic variant ordering, optimize string building in selector transform, add LRU and WeakMap caches for hot paths, introduce structured warning system with configurable handler, enable noImplicitAny across the codebase, and expand test coverage for XOR, range merging, absorption, and deduplication edge cases.

## 0.5.3

### Patch Changes

- [#16](https://github.com/tenphi/tasty/pull/16) [`caf461a`](https://github.com/tenphi/tasty/commit/caf461a8ada6f897ef3f8ebe35d1d1d2af516efb) Thanks [@tenphi](https://github.com/tenphi)! - Add top-level `types`, `main`, and `module` fields for compatibility with `moduleResolution: "node"`.

## 0.5.2

### Patch Changes

- [#14](https://github.com/tenphi/tasty/pull/14) [`d761080`](https://github.com/tenphi/tasty/commit/d7610807ac56b13052b92fc2f1fb427180d924a1) Thanks [@tenphi](https://github.com/tenphi)! - Extract style properties reference into dedicated docs/styles.md with comprehensive coverage of all custom-handled props, values, modifiers, and recommendations.

## 0.5.1

### Patch Changes

- [`2fd0a9e`](https://github.com/tenphi/tasty/commit/2fd0a9e6a1d27815878ff3c114a7e0c682aaffcb) Thanks [@tenphi](https://github.com/tenphi)! - Add eslint config file for tasty validation.

## 0.5.0

### Minor Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`4868455`](https://github.com/tenphi/tasty/commit/48684550c808d2235344aec223385234ed58d46a) Thanks [@tenphi](https://github.com/tenphi)! - Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, correctly preserving OR branches as separate selector variants and unifying their internal representation as modifier/pseudo conditions.

  **Breaking:** `@parent` direct-child syntax changed from `@parent(cond >)` to `@parent(cond, >)`. The `,` is reserved exclusively for separating the `>` direct-child flag; use `|` for OR logic inside `@parent()`.

  **Fixed:** `@parent(a) & @parent(b)` now correctly produces two independent `:is()` wrappers that can match different ancestors. Use `@parent(a & b)` when the same ancestor must satisfy both conditions.

### Patch Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`d858e95`](https://github.com/tenphi/tasty/commit/d858e959633a0e2818437137c5d56eaf58c97762) Thanks [@tenphi](https://github.com/tenphi)! - Fix parent group dedup key missing negation, guard selector dedup against non-exact operators, and simplify materialization internals.

## 0.4.2

### Patch Changes

- [`e6a6982`](https://github.com/tenphi/tasty/commit/e6a6982c1db6a75bfce0ca00f11452a25e7102e6) Thanks [@tenphi](https://github.com/tenphi)! - Drop `react-is` dependency by replacing `isValidElementType` with a lightweight internal utility. Move `@babel/helper-plugin-utils` and `@babel/types` from dependencies to optional peer dependencies since they are only needed for the Babel plugin entry point.

## 0.4.1

### Patch Changes

- [`27bc1bf`](https://github.com/tenphi/tasty/commit/27bc1bfe81e8f93f10f9d3496fefab506b4e7fa8) Thanks [@tenphi](https://github.com/tenphi)! - Add missing exports.

## 0.4.0

### Minor Changes

- [#7](https://github.com/tenphi/tasty/pull/7) [`92b700e`](https://github.com/tenphi/tasty/commit/92b700eff8007e6307d0afa894c56ab8e86f8e2f) Thanks [@tenphi](https://github.com/tenphi)! - Add `@tenphi/tasty/core` entry point exporting the full framework-agnostic styling engine (config, pipeline, parser, injector, styles, plugins, states, chunks, utils, types). This enables building tasty integrations for non-React frameworks and tools like eslint plugins without depending on React.

  Remove `@tenphi/tasty/parser` entry point — its exports are now available via `@tenphi/tasty/core`.

  Replace internal `CSSProperties` imports from React with `csstype`, extracted into a shared `CSSProperties` type alias. Also export `InnerStyleProps` (previously missing from public API).

## 0.3.0

### Minor Changes

- [#5](https://github.com/tenphi/tasty/pull/5) [`13ecc70`](https://github.com/tenphi/tasty/commit/13ecc70e7c434e009114668e095a652ad72fec8e) Thanks [@tenphi](https://github.com/tenphi)! - Change recipe syntax separator from `|` to `/` and add support for `none` value to disable base recipes.

## 0.2.0

### Minor Changes

- [#3](https://github.com/tenphi/tasty/pull/3) [`a49afea`](https://github.com/tenphi/tasty/commit/a49afea07306630ab213fe5d1b3c599b8f607f6c) Thanks [@tenphi](https://github.com/tenphi)! - Add @parent() state for styling based on parent element state (e.g. @parent(hovered), @parent(theme=dark >) for direct parent).

## 0.1.3

### Patch Changes

- [`d95087e`](https://github.com/tenphi/tasty/commit/d95087ea4c631abec255c1268daa3055da3e0e5f) Thanks [@tenphi](https://github.com/tenphi)! - Export `StyleParser`, types, and `Bucket` enum via new `@tenphi/tasty/parser` sub-path for use by external tooling (e.g., ESLint plugin).

## 0.1.2

### Patch Changes

- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
- Deduplicate CI builds on push to main

## 0.1.1

### Patch Changes

- [`ac38577`](https://github.com/tenphi/tasty/commit/ac3857771ffd88971e110517ac185044e4b1ad31) Thanks [@tenphi](https://github.com/tenphi)! - Fix node-targeted subpaths (babel-plugin, zero, next) outputting .mjs instead of .js by unifying tsdown build config into a single browser-platform entry
- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
