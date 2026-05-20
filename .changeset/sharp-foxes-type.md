---
'@tenphi/tasty': patch
---

Infer the wrapped component's prop API when `as` is a React component in the element-factory form: `tasty({ as: NextLink, ... })` now exposes `NextLink`'s own props (e.g. `href`, `replace`, `prefetch`) on the resulting Tasty component alongside the existing Tasty-specific props. Previously the resulting component was typed as if it rendered a `div` and the wrapped component's prop API was lost. Intrinsic-tag usage (`as: 'div' | 'button' | …`) and the `tasty(Component, options)` wrap form are unchanged.
