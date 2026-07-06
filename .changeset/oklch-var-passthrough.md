---
'@tenphi/tasty': patch
---

Skip the sRGB round-trip whenever a native CSS color function (`rgb`/`hsl`/`oklch`) already matches the configured output color space. Same-space values are now preserved verbatim instead of being parsed and rebuilt, which:

- Keeps `var()` / `calc()` channels intact (e.g. `oklch(var(--hue) .2 20)` is no longer NaN'd by `parseFloat`).
- Preserves mixed-case custom-property names (`var(--myHue)`) — CSS custom properties are case-sensitive and were previously lowercased.
- Preserves wide-gamut `oklch()` colors that the round-trip would clamp to the sRGB gamut.
- Avoids redundant work for static values.

Decomposed color components (`--*-color-{space}`) still normalize static percentage channels to canonical numbers (so `okhsl()` / `okhst()` output stays a valid `<number>+`), while dynamic `var()` / `calc()` channels are kept verbatim.
