---
'@tenphi/tasty': minor
---

An opacity suffix now compiles to `color-mix()` instead of relative color syntax. `#purple.5` emits `color-mix(in oklab, var(--purple-color) 50%, transparent)` where it used to emit `oklch(from var(--purple-color) l c h / .5)`. `color-mix()` is Baseline widely available (Chrome 111, Firefox 113, Safari 16.2). Relative color syntax is Baseline 2024 (Chrome 125, Firefox 128, Safari 18) and isn't widely available yet, so a project targeting widely available features can now use the suffix. The same goes for a faded replace token holding `color-mix()` or `light-dark()`, and for the `color()` helper. `#current.N` already compiled this way, and a token defined as `#current` and then faded no longer needs Safari 18.

An opaque token fades to the same color as before. Two things change:

- **Alpha composes.** The mix is premultiplied, so a token that is already translucent is faded further. A token holding `rgb(255 0 0 / .8)` faded to `.5` is now alpha `.4`; before, it was `.5`.
- **A `$prop` alpha must hold a number.** `#purple.$fade` emits `calc(var(--fade) * 100%)`, because a mix percentage can't be a `<number>`. `$fade: '.5'` works; `$fade: '50%'` no longer does. This is the rule `#current.$fade` already had.

`parseColor()` reads the token name and the opacity back from the new form.
