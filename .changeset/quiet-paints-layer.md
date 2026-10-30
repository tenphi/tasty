---
'@tenphi/tasty': minor
---

Deprecate mixing two `fill` or `backgroundColor` colors with a comma (`'#dark 4%, #surface'`) in favor of compound colors (`'#surface+#dark.04'`), which compile to the same `color-mix()` and work in every color slot. The comma mix renders as before, warns in development, and goes away in the next major version. For a mix a compound can't write, such as one weighted by a custom property, write `color-mix(in srgb, …)` with the same parts. `tasty/prefer-fill-mix` in `@tenphi/eslint-plugin-tasty` rewrites each mix to the same color. The one deprecation warning replaces the separate warnings for a translucent mix part without a percentage and for a mix of more than two colors.
