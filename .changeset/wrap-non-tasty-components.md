---
'@tenphi/tasty': minor
---

Allow `tasty(Component, options)` to wrap any React component that forwards
`className` (Next.js `Link`, `react-router` `Link`, Radix primitives, MUI,
plain `forwardRef`/`memo`, …). Tasty-produced components are now branded
internally and continue to use the prop-forwarding path with their full
`styles`/`mods`/`tokens` pipeline; non-branded components are styled via
their `className` prop, while Tasty-specific props (`qa`, `qaVal`, `mods`,
`tokens`, `isDisabled`, `isHidden`, `isChecked`, plus declared
`styleProps`/`modProps`/`tokenProps`) are consumed by the wrapper and
converted to `data-*` attributes or CSS custom properties instead of
leaking to the DOM. As a side benefit, passing a string tag as the first
argument (`tasty('div', { styles })`) now works too.
