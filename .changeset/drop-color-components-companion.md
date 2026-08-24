---
'@tenphi/tasty': minor
---

Removed the `--name-color-{colorSpace}` companion variables.

**Breaking (CSS surface):** every `#name` color token used to declare a second
variable holding its channels decomposed — `--purple-color-oklch: 0.42 0.16 328`
— alongside `--purple-color`, plus a matching `@property` rule, and `color` also
emitted `--current-color-{space}` next to `--current-color`. All of those are
gone. External CSS reading a companion directly should address the token itself
with relative color syntax instead: `oklch(from var(--purple-color) l c h)` in
place of `oklch(var(--purple-color-oklch))`, which additionally works on the
colors the companion could never decompose.

The companion existed to give `#token.alpha` channels to write an alpha into.
Since opacity moved to relative color syntax it has had no reader inside Tasty,
so this removes emitted output nothing consumed:

- **One declaration less per color** in every rule that sets a color, and one
  fewer inline style property per `#name` entry in the `tokens` prop.
- **One `@property` rule less per color token**, on all of the runtime, SSR, RSC
  and zero-runtime paths — registration is the expensive part of `@property`.
- **A pass removed from auto-property inference.** `PropertyTypeResolver` no
  longer scans declarations for companions ahead of its main pass, so every
  injection does less work.
- **~0.7 kB brotli off `main`** (0.8 off `core`, 0.5 off `static`), and the
  colour LRU cache that memoized decomposed channels is gone.

`colorSpace` keeps its job — it still decides the space a statically known color
is emitted in (`#brand: '#ff8800'` → `--brand-color: oklch(0.75 0.16 55)`).
Opacity is unaffected: it was already always written in `oklch`.
