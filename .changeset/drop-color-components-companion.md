---
'@tenphi/tasty': minor
---

Colors are emitted as authored, and the `--name-color-{colorSpace}` channel
companions are gone.

Two things existed only to serve the opacity suffix back when it needed numeric
channels to write an alpha into:

- A `#name` token declared a second variable holding its channels decomposed —
  `--brand-color-oklch: 0.75 0.16 55` — plus a matching `@property` rule, and a
  `color` style emitted `--current-color-{space}` beside `--current-color`.
- A token's value was rewritten into the configured `colorSpace`, so
  `#brand: '#ff8800'` declared `--brand-color: oklch(0.75 0.16 55)`.

Opacity now uses relative color syntax — `oklch(from var(--brand-color) l c h /
.5)` — which has the browser read the channels off whatever the value resolves
to. Neither is load-bearing any more, so both are removed and a color passes
through untouched: `--brand-color: #ff8800`.

`configure({ colorSpace })` is **deprecated** — still accepted, no longer has any
effect, warns in development, and will be removed in the next major.

No public API changes: nothing exported moves and class name hashes are
identical. What changes is the emitted CSS.

```css
/* before */
color: oklch(var(--brand-color-oklch) / 0.5);
background: oklch(var(--brand-color-oklch));

/* after */
color: oklch(from var(--brand-color) l c h / 0.5);
background: var(--brand-color);
```

If you relied on `colorSpace` for uniform output, author the token in the space
you want — the value is no longer rewritten. See
[Color space](https://github.com/tenphi/tasty/blob/main/docs/configuration.md#color-space).

What it buys:

- **~2.0 kB brotli off `main` and `core`, ~2.6 kB off `static`, `zero` and
  `babel-plugin`** — the whole sRGB round-trip and the LRU cache that memoized
  it are gone.
- One declaration less per color in every emitted rule, and one fewer inline
  style property per `#name` entry in the `tokens` prop.
- One `@property` registration less per color token, on the runtime, SSR, RSC and
  zero-runtime paths.
- A pre-pass removed from `PropertyTypeResolver.scanDeclarations`, so every
  injection does less work.

Also fixes `parseColor()` not recognizing a CSS named color that starts with
`r`, `h`, `l`, `o`, `v`, `c`, or `t` — `red`, `hotpink`, `lime`, `orange`,
`violet`, `coral` and `teal` were rejected (and warned about) where `blue` and
`green` were accepted, purely because of the first-character dispatch. Every
named color resolves now.
