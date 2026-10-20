---
'@tenphi/tasty': patch
---

Media and container query bounds in different units are no longer compared as plain numbers. Before, `600px` and `40em` were ordered as 600 vs 40, so `@media(w >= 600px) & @media(w < 40em)` was dropped as an empty range. `@media(w > 600px) & @media(w > 40em)` lost its `em` bound, and a `w < 40em` branch followed by `w < 600px` never applied. Bounds are now compared, merged and pruned only within one unit, and `calc()` bounds are kept instead of being dropped next to a numeric one.
