---
'@tenphi/tasty': minor
---

Set `variant` in `tasty({ variants, variant: 'primary' })` to choose the variant applied when the `variant` prop is omitted or names no variant. Before, that option was passed to the DOM as a `variant` attribute, and without a `default` key an omitted `variant` applied only the base styles.
