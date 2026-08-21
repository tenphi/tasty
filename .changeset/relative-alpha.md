---
'@tenphi/tasty': minor
---

Apply the color-token opacity suffix with CSS relative color syntax instead of the channel components.

`#purple.5` now emits `oklch(from var(--purple-color) l c h / .5)` where it previously emitted `oklch(var(--purple-color-oklch) / .5)`. The channels are copied over and the alpha slot is written, which asks nothing of the color beyond *being* a color — so the suffix no longer needs the token decomposed into channels first.

That makes it work where it used to break:

- a token holding a `color-mix()`, a `light-dark()`, or a `color()` in a space Tasty cannot convert — none of which have channels to decompose
- a `--name-color` variable declared in your own CSS, with no Tasty token definition and no companion variable behind it, which previously fell back to the `@property` initial value and silently rendered black

Writing the alpha slot keeps two properties that compositing with `color-mix()` against `transparent` would have broken: alpha is **replaced** rather than multiplied (a token holding `rgb(255 0 0 / .8)` faded to `.5` is `.5`, not `.4`), and the alpha may be a `<number>` **or** a `<percentage>`, so `#purple.$fade` works whether `$fade` holds `.5` or `50%` — which is what `--*-opacity` properties are registered to accept. The authored digits also survive verbatim, so `#purple.07` stays `.07`.

`#current.N` is unchanged and still **composes**: `currentcolor` is the color an element inherits, which an ancestor may already have faded, so `#current.4` means "40% of what reaches me" and a nested `#current.18` under it lands at `.072`. Color ramps built on `#current` depend on that. Its percentage is now derived by shifting the decimal point rather than multiplying, so `#current.07` emits `7%` instead of `7.000000000000001%`.

The space is always `oklch`, whatever `colorSpace` is set to: it is unbounded, so a wide-gamut color survives a round trip that a gamut-limited space would clamp.

**What changes for consumers:**

- Generated CSS changes for every `#token.alpha` value. The colour and its computed serialization are unchanged — `oklch(…)`, as before — so snapshots over computed styles are largely unaffected; snapshots over *emitted* CSS text need updating. `#current.alpha` is untouched.
- Relative color syntax is required on the common path, moving the effective floor to Chrome 119 / Safari 16.4 / Firefox 128.
- `parseColor().color` returns the faded form; `.name` and `.opacity` are unchanged, both read through it.

`--name-color-{space}` companions are untouched: they are still generated, still registered as `@property`, and still what you reach for to address a token's channels. An opacity suffix does not move them — `color="#purple.5"` still reports `#purple`'s own channels in `--current-color-{space}`.

A *replace token* is substituted while parsing, so its colour is faded in place: `#brand: 'hsl(220 90% 50%)'` with `#brand.5` still gives `hsl(220 90% 50% / .5)`.

Also fixes `color(name, 0.07)` emitting `7.000000000000001%`.
