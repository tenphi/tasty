---
'@tenphi/tasty': patch
---

The `variant` option of `tasty(Base, options)` now type-checks against both sets of variants when the base component defines its own. Before, `tasty(Card, { variants: { plain: … }, variant: 'plain' })` failed with "No overload matches this call" if `Card` had variants of its own, and so did naming one of `Card`'s variants. The option now accepts a variant from either set, as the extension's `variant` prop already did. Runtime behaviour is unchanged.
