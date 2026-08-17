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
