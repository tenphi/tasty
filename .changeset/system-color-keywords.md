---
'@tenphi/tasty': patch
---

CSS system colors (`Canvas`, `CanvasText`, `Highlight`, `ButtonText`, `GrayText`, `LinkText`, …) and named colors are now colors wherever a style takes one.

- A color token can hold one. `'#sys-canvas': 'Canvas'` emits `--sys-canvas-color: Canvas` in styles, `globalStyles` and `configure({ tokens })` alike. Before, it warned `unable to parse color` and emitted nothing.
- `border` and `outline` keep a keyword color instead of replacing it with `var(--border-color)` / `var(--outline-color)`: `border: '1bw Highlight'` emits `1px solid highlight`. The same goes for named colors (`border: '1bw red'`), for `shadow` next to `inset` (`'inset 0 0 1x red'` dropped the color), and for `scrollbar` and `fade`.
- A `var()` whose fallback is a single color is a color: `'#accent': 'var(--brand, GrayText)'`, `border: '1bw var(--brand, Highlight)'`.
- A replace token can alias a keyword color: with `replaceTokens: { '#forced': 'Highlight' }`, `fill: '#forced'` emits `highlight` instead of `#forced`, and `#forced.5` fades it.

Keyword colors are emitted lowercase inside a style, so `fill: 'Canvas'` now emits `canvas`; CSS matches them case-insensitively. The deprecated system colors (`Menu`, `Window`, `ButtonHighlight`, …) are not recognized.
