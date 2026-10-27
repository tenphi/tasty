---
'@tenphi/tasty': minor
---

Add compound colors: join color tokens with `+` to paint each one at its opacity over the colors before it, as one color that works anywhere a color token does. `'#surface+#dark.04'` compiles to `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`, which is exactly `#dark` at 4% drawn over `#surface`, and layers stack left to right (`'#surface+#accent.1+#dark.04'`). Layer tokens must be opaque, with the opacity in the suffix. It replaces the deprecated two-color `fill`: put a `+` where the space was, and the development warning for the old form now suggests the fix for the colors it was given. A `#` token joined by `+` to anything but color tokens is dropped with a development warning, and a `+` written with spaces around it gets one too.
