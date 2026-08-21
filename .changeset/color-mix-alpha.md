---
'@tenphi/tasty': minor
---

Apply the color-token opacity suffix with `color-mix()` instead of the channel components.

`#purple.5` now emits `color-mix(in oklab, var(--purple-color) 50%, transparent)` where it previously emitted `oklch(var(--purple-color-oklch) / .5)`. The colour is unchanged — mixing premultiplied against a fully transparent colour leaves the channels alone and sets the alpha — but it no longer needs the token decomposed into channels first.

That makes the suffix work where it used to break:

- a token holding a `color-mix()`, a `light-dark()`, or a `color()` in a space Tasty cannot convert — none of which have channels to decompose
- a `--name-color` variable declared in your own CSS, with no Tasty token definition and no companion variable behind it, which previously fell back to the `@property` initial value and silently rendered black

The mixing space is always `oklab`, whatever `colorSpace` is set to: alpha application is space-independent, and oklab is unbounded, so a wide-gamut colour survives a round trip that `in srgb` would clamp.

**What changes for consumers:**

- Generated CSS changes for every `#token.alpha` value. The colour is the same, but snapshot tests over emitted CSS or `getComputedStyle` will need updating — computed colours now serialize as `oklab(…)` rather than `oklch(…)`.
- `color-mix()` is required on the common path, moving the effective floor to Safari 16.2 (from 15.4). Chrome 111 and Firefox 113 are unchanged, and `#current.5` already required it.
- `parseColor().color` returns the `color-mix()` wrapper; `.name` and `.opacity` are unchanged, both read through it.

`--name-color-{space}` companions are untouched: they are still generated, still registered as `@property`, and still what you reach for to address a token's channels. An opacity suffix does not move them — `color="#purple.5"` still reports `#purple`'s own channels in `--current-color-{space}`.

A *replace token* is substituted while parsing, so its colour is faded in place rather than wrapped: `#brand: 'hsl(220 90% 50%)'` with `#brand.5` still gives `hsl(220 90% 50% / .5)`.
