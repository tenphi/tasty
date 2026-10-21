---
'@tenphi/tasty': patch
---

`transition: 'none'` turns transitions off, alone or under a state. `transition: { '': 'opacity 80ms', '@reduced-motion': 'none' }` now emits `transition: none` under `@reduced-motion`. Before, `none` was read as a property name and emitted `none var(--none-transition, var(--transition))`, which the browser dropped, so the default transition kept running.
