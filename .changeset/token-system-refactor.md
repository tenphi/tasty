---
'@tenphi/tasty': minor
---

Refactor token system: `configure({ tokens })` now injects CSS custom properties on `:root` with state map support

**Breaking changes:**

- `configure({ tokens })` no longer performs parse-time substitution. Instead, tokens are injected as CSS custom properties on `:root` when the first style is rendered. Token values are parsed through the Tasty DSL and support state maps for responsive/theme-aware values.
- The old parse-time substitution behavior is now available via `configure({ replaceTokens })`.
- `TYPOGRAPHY_PRESETS` has been removed. Use `generateTypographyTokens()` with your own presets instead.
- `generateTypographyTokens()` now requires a `presets` argument (no longer has a default).

**Migration guide:**

```ts
// Before
configure({
  tokens: { $spacing: '2x', '#accent': '#purple' },
});

// After — for parse-time substitution (same behavior as before)
configure({
  replaceTokens: { $spacing: '2x', '#accent': '#purple' },
});

// After — for :root CSS custom properties (new recommended approach)
configure({
  tokens: {
    '$gap': '8px',
    '#primary': {
      '': '#purple',
      '@dark': '#light-purple',
    },
  },
});
```
