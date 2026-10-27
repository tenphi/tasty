---
'@tenphi/tasty': minor
---

`fill` and `backgroundColor` mix two comma-separated colors into one `background-color`: `fill: '#dark 4%, #surface'` compiles to `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`. With an opaque `#dark`, that is exactly the color the old overlay layer painted, but contrast checkers such as axe-core can read it, and it transitions like any other color.

Two colors separated by a space (`fill: '#surface #dark.04'`) are deprecated and warn in development. Their output is unchanged until the next major version; rewrite them as a mix, e.g. `'#dark 4%, #surface'`. A mixed color with an opacity but no percentage (`'#dark.04, #surface'`) warns too, because the mix comes out see-through.
