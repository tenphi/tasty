---
'@tenphi/tasty': minor
---

Deprecate mixing two `fill` or `backgroundColor` colors with a comma (`'#dark 4%, #surface'`) in favor of compound colors (`'#surface+#dark.04'`), which compile to the same `color-mix()` and work in every color slot. The comma mix renders as before, warns in development, and goes away in the next major version. The warning names the rewrite for the colors it was given: a compound color when one part is a token weighted by a literal percentage, and `color-mix(in srgb, …)` with the same parts otherwise, such as for a weight from a custom property. A translucent part without a percentage (`'#dark.04, #surface'`) is pointed at the compound that paints it over the other color. A translucent part opposite a weighted one, such as `'#dark 4%, #surface.5'`, is no longer reported as see-through: it is the base of the layer, and the mix is exact.
