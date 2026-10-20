---
'@tenphi/tasty': patch
---

`false` now writes nothing in `padding`, `margin`, `inset`, `scrollMargin` and `scrollPadding` (and their per-side styles), in `width`, `height`, `blockSize` and `inlineSize` (and their `min`/`max` styles), and in `outlineOffset`, as it already did in every other style. This holds whether `false` is set directly or under a state. Before, `padding: { '': false, hovered: '2x' }` wrote the default gap outside `hovered`, `width: false` wrote `width: auto; min-width: initial; max-width: initial`, and `outlineOffset: false` wrote `outline-offset: false`. `true` still means the default value. `outlineOffset: true`, which names no offset, is now ignored too. `fontStyle: false` still means `normal`.
