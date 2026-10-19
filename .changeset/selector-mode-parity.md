---
'@tenphi/tasty': patch
---

Fix selector-mode styles (`useGlobalStyles`, `globalStyles` in `configure()`, `tastyStatic(selector, …)`, `extractStylesForSelector`):

- `@starting` values are wrapped in `@starting-style` instead of being emitted as a plain rule that applied permanently.
- Tokens and other styles whose states use `@root()` on a selector that is the root itself (`:root`, `html`, `:where(:root)`) now attach the states to it (`:root:where([data-schema="dark"])`) instead of requiring a root inside the root, which never matched. This includes theme tokens defined in `configure({ tokens })`.
- Local `@keyframes` (and configured `keyframes`) used by an `animation` are emitted alongside the rules, under the name the declaration is rewritten to.
- A selector list such as `'.card, .panel'` gives every item its states and sub-elements, not only the last one. Surrounding whitespace and empty list items are ignored, so `'.card '` no longer turns states into a descendant selector.
- Build-time `@keyframes` steps follow Tasty style semantics, as they do at runtime: units, color tokens and `$` properties produce valid CSS, the custom properties set by local `@keyframes` get their `@property` types inferred, and style names map like everywhere else in Tasty (`fill` becomes `background-color`).
- Build-time animation renaming no longer rewrites names inside longer ones (`spin` in `spin-fast`) or custom properties such as `--my-animation`.
- In React Server Components, CSS queued by standalone style functions is no longer dropped when the next component renders no class.
