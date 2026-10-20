---
'@tenphi/tasty': minor
---

The extension form, `tasty(Base, options)`, now does what its options type-check for, instead of silently ignoring them:

- `styleProps` turns the listed props into styles, `modProps` into mods and `tokenProps` into tokens. Before, they reached `Base` as unknown props, and `modProps` ended up as DOM attributes.
- `variants` apply on top of the extension's `styles` (the `variant` it forwards still selects the base's own variants), and the `variant` option sets the default.
- `elements` adds sub-elements, and the base's sub-elements are kept: `tasty(Card, …).Title` is `Card.Title`.

The returned component is typed with the props these options add, its own sub-elements, and the base's.

`getDisplayName()` now looks through `forwardRef()` and `memo()` to the component they wrap, and names a tag after itself, so an extension of a `forwardRef` component is no longer named `TastyWrappedComponent(Anonymous)`.
