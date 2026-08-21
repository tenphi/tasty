---
'@tenphi/tasty': minor
---

Treat modern CSS color functions as colors so they reach the color slot of every style property.

`light-dark()` and `contrast-color()` are now recognized alongside `color-mix()`, `color-contrast()`, `color()` and the channel functions, and the tokens inside them are expanded. `fill`, `color`, `border`, `outline`, `shadow` and `svgFill` place the whole call in their color slot instead of dropping it or emitting the unresolved DSL.

- `light-dark()` is filed by content: `light-dark(#dark, #light)` is a color, `light-dark(1x, 2x)` stays a value, so `padding: 'light-dark(1x, 2x)'` still works.
- `shadow` splits layers through the parser instead of `split(',')`, so a color function's own commas no longer tear a layer apart.
- An opacity suffix on a replace token that resolves to a derived color function wraps the call — `color-mix(in oklab, <color> 50%, transparent)` — instead of appending a slash alpha the function has no channel for.
- A color token whose value cannot be decomposed at build time gets its `--name-color-{space}` companion expressed by reference with relative color syntax, so `#token.alpha` keeps working. Such a companion is registered as `@property … syntax: "*"`; numeric companions keep `<number>+`. The SSR collector no longer emits a second, conflicting companion rule for it.
- `parseColor()` no longer reports the name of a `var()` reference found *inside* a color function as the color's own name — `color-mix(in oklab, #purple 50%, #red)` is not named `purple`.
- The `tokens` prop keeps the whole fallback chain in the components companion: `(#primary, #fallback)` now yields `var(--primary-color-{space}, var(--fallback-color-{space}))` instead of only the last fallback.
