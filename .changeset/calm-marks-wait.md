---
'@tenphi/tasty': patch
---

States on a selector that ends in a pseudo-element now attach to the originating element, before the pseudo-element. Before, `@own(...)` on a sub-element such as `{ $: 'a::before' }` produced `a::before:where([rel="next"])`, and a `useGlobalStyles('.card::before', …)` state produced `.card::before:where(:hover)`. Those rules never matched, default branch included, because browsers accept almost nothing after a pseudo-element. They now come out as `a:where([rel="next"])::before` and `.card:where(:hover)::before` in every mode: `tasty()`, `useGlobalStyles()`, SSR, and zero-runtime `tastyStatic`. This covers `::before`, `::marker`, `::backdrop`, vendor-prefixed and functional pseudo-elements such as `::-webkit-details-marker` and `::part(x)`, and the legacy single-colon forms.

One behaviour change: on `::part()`, `::-webkit-scrollbar-thumb`, `::-webkit-details-marker` and `::file-selector-button` targets, a user-action state such as `@own(:hover)` used to match the pseudo-element's own hover. It now matches the originating element. To keep the pseudo-element's own state, write it after the pseudo-element: `$: '@::part(label):hover'`, or a nested `'&:hover'` key.
