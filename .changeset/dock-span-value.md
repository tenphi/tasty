---
'@tenphi/tasty': minor
---

`inset`'s `dock` modifier now takes a second value for the spanned sides.

Values are consumed positionally by the named directions — `inset: '1x 2x left right'` sets left `1x` and right `2x` — so the value *after* the directional ones now applies to the perpendicular pair a `dock` spans:

```
inset: '2x 4x bottom dock'  ->  inset: auto 32px 16px 32px   (bottom 2x, sides 4x)
inset: '2x 4x right dock'   ->  inset: 32px 16px 32px auto   (right 2x, top/bottom 4x)
```

With no second value the span keeps reusing the edge's own value, so `inset: 'bottom dock'` and `inset: '2x bottom dock'` are unchanged.

`dock` is intended for a single edge; combining it with several directions has no well-defined meaning.
