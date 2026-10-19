---
'@tenphi/tasty': patch
---

Zero-runtime CSS now keeps the defaults that style handlers read from Tasty's default tokens. That CSS ships without the default `@property` set, so several handler `var()`s had no value there. `transition` with no duration now falls back to `80ms` (`var(--transition, 80ms)`) instead of producing an invalid `transition` that disabled the animation. `preset: '… / strong'` now bolds to `700` instead of inheriting the weight. `font: true`, `font: 'monospace'`, a custom `font` and preset font families now fall back to `system-ui, sans-serif` or `ui-monospace, monospace` instead of the inherited font (a custom `font` was dropped entirely). Define `$font-sans` / `$font-mono` (or the `-fallback` tokens) for the full stacks runtime uses. Runtime and SSR output renders the same as before for all three.

**Visible change:** a `border` with no color is now drawn in the text color (`currentColor`) in every mode until your tokens define `#border`. Tasty's default `#border` property now starts at `currentcolor` instead of `rgb(0 0 0)`. Before, those borders were black at runtime and in SSR but used the text color in zero-runtime CSS. Apps that define `#border`, as most design systems do, see no change. To keep black borders, define `#border` in your tokens.
