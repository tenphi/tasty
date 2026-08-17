---
'@tenphi/tasty': patch
---

Fix `$name` references leaking unsubstituted into CSS from pass-through style values.

A `$name` reference is classified as a color only when the name ends with
`-color`; otherwise it lands in the value bucket. Handlers that read one bucket
and fall back to their raw input therefore emitted the authored DSL verbatim,
which browsers drop as an invalid declaration:

```jsx
// Previously emitted `background-color: $current-fill-hover` and applied nothing.
tasty({
  styles: {
    '$current-fill-hover': '#current.04',
    fill: { '': '#current.0', hovered: '$current-fill-hover' },
  },
});
```

The same happened in the other direction (`fontSize: '$my-size-color'` →
`font-size: $my-size-color`) and in every handler that passes keyword values
straight through: `display`, `overflow`, `whiteSpace`, `flow`, `place` /
`align` / `justify` and their longhands, `textTransform`, `font` /
`fontFamily`, `color`, `fill` / `backgroundColor`, `svgFill`, `background-clip`
/ `-origin` / `-repeat` / `-attachment`, and `outlineOffset`.

All of them now substitute references before emitting. Values without a `$`
still skip the parser entirely, so pass-through output — including case-sensitive
font family names and `var()` references — is unchanged.

`border` and `outline` now put a `$name` reference in the **line-style** slot
instead of dropping it. The style normally arrives as a keyword (`solid`,
`dashed`, …), which a custom property has no way to match, so a reference past
the width slot is the style — colors are authored as `#name`, and the
`$name-color` form the parser buckets as a color is there to reference a raw CSS
custom property, not as the way colors are written:

```jsx
// Previously `1px solid var(--border-color, currentColor)` — the reference was dropped.
tasty({ styles: { border: '1bw $my-style' } });
// Now `1px var(--my-style) var(--border-color, currentColor)`.
```

A reference fills the first free slot: width, then style. `$name-color`
references still land in the color slot, and a second _length_ is still ignored
rather than promoted (two lengths are not valid in these shorthands).
