---
'@tenphi/tasty': patch
---

States on a pseudo-element target are now the pseudo-element's own states, and states it can't have are ignored with a warning instead of breaking the rule.

When a sub-element's `$` ends in a pseudo-element, `@own(...)` describes that pseudo-element. A pseudo-class goes after it (`@own(:focus)` on `$: '@::part(label)'` → `::part(label):where(:focus)`), as before. A state that tests what a pseudo-element has none of is now dropped with a `PSEUDO_ELEMENT_STATE_IGNORED` warning: a modifier, an attribute, a class, or a tree position (`@own([rel="next"])`, `@own(hovered)`, `@own(:first-child)`). Before, such a state produced `a::before:where([rel="next"])`, which never matched. Its negated default branch never matched either, so the base value didn't apply. Write a condition on the element the pseudo-element belongs to in `$` instead: `$: 'a[rel="next"]::before'`.

The same holds for a `useGlobalStyles()` / `tastyStatic` selector that ends in a pseudo-element, such as `.card::before`. Its states go after the pseudo-element, attribute and modifier states are ignored with a warning, and `@parent(...)` now goes before the pseudo-element (`.card:where(.dark *)::before`) instead of after it, where it never matched. This applies in every mode: `tasty()`, `useGlobalStyles()`, SSR, and zero-runtime. The check uses CSS syntax only, never browser support, so every environment gets the same CSS.
