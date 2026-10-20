---
'@tenphi/tasty': minor
---

Tasty's default `@property` set is now the only source of the defaults style handlers read. The handlers no longer repeat them as inline `var()` fallbacks:

- `transition` emits `var(--name-transition, var(--transition))` instead of `var(--name-transition, var(--transition, 80ms))`.
- `preset: 'name / strong'` emits `font-weight: var(--bold-font-weight)` instead of `var(--bold-font-weight, 700)`.
- `font` emits `var(--font-sans, var(--font-sans-fallback))` and `var(--font-mono, var(--font-mono-fallback))` without the short inner font stacks.
- `border` and the logical border styles emit `var(--border-color)` instead of `var(--border-color, currentColor)` for a border with no color, as `outline` already does for `var(--outline-color)`.

Every rendering path emits the default set: the runtime injector, the SSR collector, and the Babel plugin. **`extractConfigProperties()` is now exported from `@tenphi/tasty/zero`**, so CSS built with the programmatic API can include it too. It returns Tasty's default `@property` rules overlaid with the `properties` set through `configure()`, or with the ones you pass.

If you write CSS with `extractStylesWithChunks()` or `extractStylesForSelector()`, emit `extractConfigProperties()` once per stylesheet. Otherwise a border with no color, `transition`, and `preset` with `strong` resolve to nothing. In engines without `@property` support (Firefox before 128, Safari before 16.4), these defaults no longer apply unless the app defines the tokens itself.
