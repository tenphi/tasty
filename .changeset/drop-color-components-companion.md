---
'@tenphi/tasty': minor
---

Removed the `--name-color-{colorSpace}` channel companion variables.

A `#name` color token used to declare a second variable beside `--name-color`
holding its channels decomposed — `--brand-color-oklch: 0.75 0.16 55` — plus a
matching `@property` rule, and a `color` style emitted `--current-color-{space}`
beside `--current-color`. They existed so an opacity suffix had channels to write
an alpha into; nothing has read one since opacity moved to relative color syntax,
so this removes emitted output with no consumer.

No public API changes — nothing exported moved, and class name hashes are
identical. What changes is the emitted CSS, so hand-authored CSS that reached for
a companion needs the token itself instead:

```css
/* before */
color: oklch(var(--brand-color-oklch) / 0.5);
background: oklch(var(--brand-color-oklch));

/* after */
color: oklch(from var(--brand-color) l c h / 0.5);
background: var(--brand-color);
```

Relative color syntax is strictly more capable here: the companion could only
carry channels for a color the engine could evaluate at build time, while
`from <color>` works on every `<color>` — a `color-mix()`, a `light-dark()`, a
variable Tasty never defined. See [Color space](https://github.com/tenphi/tasty/blob/main/docs/configuration.md#migrating-off-the-channel-companions).

What it buys:

- One declaration less per color in every emitted rule, and one fewer inline
  style property per `#name` entry in the `tokens` prop.
- One `@property` registration less per color token, on the runtime, SSR, RSC and
  zero-runtime paths.
- A pre-pass removed from `PropertyTypeResolver.scanDeclarations`, so every
  injection does less work.
- ~0.8 kB brotli off `main` (0.9 off `core`, 0.5 off `static` and `zero`, 0.7 off
  `babel-plugin`), plus the LRU cache that memoized decomposed channels.

Also fixes a spurious `[Tasty] unable to parse color` warning for a `#name` token
set to a bare CSS color keyword such as `red`, which converted correctly but
warned anyway.

`colorSpace` keeps its job — it still decides the space a statically known color
is emitted in. Opacity is unaffected: it was already always written in `oklch`.
