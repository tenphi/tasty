---
'@tenphi/tasty': patch
---

Resolution queries now keep CSS's own `x` unit: `@media(min-resolution: 2x)` and `@media(resolution >= 2x)` reach the browser as written instead of having `2x` rewritten as a spacing length, which stopped them from ever matching. Tasty units are still converted in `width`, `height`, `inline-size` and `block-size` conditions, including `min-width: 40x`. Range syntax over other features (`@media(aspect-ratio > 16/9)`) now passes through as a media query instead of becoming an invalid selector.
