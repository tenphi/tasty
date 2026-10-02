---
'@tenphi/tasty': patch
---

A `transition` entry that names one property now keeps its own duration, easing and delay when a semantic group covering the same property appears later in the list. `transition: 'opacity 120ms ease-in-out, theme'` used to transition opacity with `theme`'s timing, because `theme` includes `opacity`; now the opacity entry wins in either order. Two groups, or two entries for the same property, still resolve last-wins.
