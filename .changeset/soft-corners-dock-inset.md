---
'@tenphi/tasty': minor
---

Add single-corner `radius` modifiers and an `inset` `dock` modifier. Both cases previously had no expressible form, which forced authors into raw 4-value box syntax.

**`radius` now accepts single-corner modifiers** — `top-left`, `top-right`, `bottom-right`, `bottom-left`. A directional modifier addresses the corner *pair* along an edge (`radius: 'top'` rounds top-left and top-right), so one corner on its own could not be expressed. Previously an unrecognized corner name was silently dropped and the value applied to **every** corner: `radius: '4px top-left'` emitted `border-radius: 4px` instead of only the top-left corner. Now:

```
radius: 'top-right'        ->  border-radius: 0 var(--radius) 0 0
radius: '4px top-left'     ->  border-radius: 4px 0 0 0
radius: 'top bottom-right' ->  border-radius: var(--radius) var(--radius) var(--radius) 0
```

The value is optional and defaults to `var(--radius)` (`1r`), matching edge modifiers. Corner modifiers combine with edge modifiers, work with `longhand`, and accept CSS-wide keywords (`radius: 'inherit top-right'`).

**`inset` now accepts a `dock` modifier** that pins the named edge and spans its full length, applying the value to the two perpendicular sides as well:

```
inset: 'bottom dock'    ->  inset: auto 0 0 0     (bottom-anchored, full width)
inset: 'right dock'     ->  inset: 0 0 0 auto     (right-anchored, full height)
inset: '2x bottom dock' ->  inset: auto 16px 16px 16px
inset: 'dock'           ->  inset: 0
```

Properties opt in via the new `spanModifiers` field on `DirectionalConfig`; only `inset` sets it, so `padding`, `margin` and `scrollMargin` treat `dock` as an unknown modifier and are unchanged.

No behaviour change for any previously valid input — edge modifiers, shapes (`round`, `ellipse`, `leaf`, `backleaf`), `longhand`, multi-group syntax and individual direction props all emit exactly what they did before.
