---
'@tenphi/tasty': patch
---

States on a selector that ends in a pseudo-element now attach to the originating element, before the pseudo-element. Before, `@own(...)` on a sub-element such as `{ $: 'a::before' }` produced `a::before:where([rel="next"])`, and a `useGlobalStyles('.card::before', …)` state produced `.card::before:where(:hover)`. Browsers drop such a rule as an invalid selector, including its default branch. These now come out as `a:where([rel="next"])::before` and `.card:where(:hover)::before` in every mode: `tasty()`, `useGlobalStyles()`, SSR, and zero-runtime `tastyStatic`. This covers `::before`, `::marker`, `::backdrop`, vendor-prefixed and functional pseudo-elements such as `::-webkit-details-marker` and `::part(x)`, and the legacy single-colon forms. A pseudo-class written after the pseudo-element, as in `::part(x):hover`, stays after it.
