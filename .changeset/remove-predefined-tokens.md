---
'@tenphi/tasty': minor
---

Remove predefined design-system tokens (colors, sizes, spacing, shadows, layout, base) from the package. These tokens belong to consuming design systems (e.g. `@cube-dev/ui-kit`), not to the styling engine itself.

The `TypographyPreset` interface and `generateTypographyTokens()` utility remain available. Built-in CSS properties (`$gap`, `$radius`, `$border-width`, `$outline-width`, `$transition`, `$sharp-radius`, `$bold-font-weight`, `#white`, `#black`) in `INTERNAL_PROPERTIES` are unaffected.
