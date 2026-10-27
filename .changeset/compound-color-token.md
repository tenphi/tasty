---
'@tenphi/tasty': minor
---

Add compound colors: join color tokens with `+` to paint each one at its opacity over the colors before it, as one color that works anywhere a color token does. `'#surface+#dark.04'` compiles to `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`, which is exactly `#dark` at 4% drawn over `#surface`, and layers stack left to right (`'#surface+#accent.1+#dark.04'`). It is the drop-in replacement for the deprecated two-color `fill`: put a `+` where the space was, and the development warning for the old form now names that replacement.
