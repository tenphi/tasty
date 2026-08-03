---
'@tenphi/tasty': major
---

A style group that names direction modifiers now takes a single value.

Values and modifiers are bucketed separately per comma group, so the interleaving that `padding: '2x 4x top right'` suggests never survived parsing: `'2x top 4x right'` and `'top 2x right 4x'` were the same input, and the pairing was decided by the order the *modifiers* happened to appear in. `'1x 2x right top'` and `'1x 2x top right'` produced different CSS, and `'1x 2x top top'` silently assigned `top` twice.

A group that names directions now applies its **first** value to every direction it names, and extra values are ignored with a development-mode warning (silent in production, never throws). Per-side values come from comma-separated groups:

```
padding: '2x 4x top right'   ->  padding: '2x top, 4x right'
margin:  'right 1x top 2x'   ->  margin:  '1x right, 2x top'
inset:   'left 2x right 1x'  ->  inset:   '2x left, 1x right'
fade:    '3x 1x top bottom'  ->  fade:    '3x top, 1x bottom'
```

Affects `padding`, `margin`, `inset`, `scrollMargin`, and `fade`.

**Unchanged:** single-value directional groups (`padding: '2x top'`, `'1x left right'`), every value-only CSS shorthand form (`padding: '1x 2x'`, `'1x 2x 3x 4x'`, and now `fade: '3x 1x'` too — a group that names no direction is unambiguous and keeps plain shorthand order), CSS-wide keywords, and the `longhand` modifier.

`inset`'s `dock` modifier keeps its two-value form, with sharper semantics: the first value applies to the named edge and the second to the perpendicular sides it spans, so `inset: '2x 4x bottom dock'` still gives `auto 32px 16px 32px`. A third value with `dock`, or a second value without it, now warns. `dock` is `inset`-only, so `padding`, `margin`, and `scrollMargin` get the strict one-value rule with no exception.
