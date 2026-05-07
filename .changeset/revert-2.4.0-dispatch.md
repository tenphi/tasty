---
'@tenphi/tasty': minor
---

Revert the dispatch behaviour introduced in 2.4.0. `tasty(Component, options)`
again unconditionally uses the prop-forwarding wrap path; the brand-based
discriminator (`brandTastyComponent` / `isTastyComponent`) and the
`tasty('div', options)` shorthand are removed.

To apply styles to a third-party component (Next.js `Link`, `react-router`
`Link`, Radix primitives, MUI, …) or to a string DOM tag via `className`, use
the options-only form with `as`:

```ts
const Link = tasty({ as: NextLink, styles: { … } });
const Span = tasty({ as: 'span',   styles: { … } });
```

This restores 2.3.x semantics for `tasty(Component, …)` and removes the silent
prop-leakage that 2.4.0 introduced when wrapping plain `forwardRef`/`memo`
components that were not branded.
