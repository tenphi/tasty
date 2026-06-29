---
'@tenphi/tasty': minor
---

Add support for the CSS `@function` at-rule (custom functions).

Define reusable, parameterized CSS functions via a new `'@function'` styles key, the `useFunction` hook, or `configure({ function })`. Functions are defined with `$$name` keys and invoked with the `$$name(...)` sugar (e.g. `marginTop: '$$negative(10px)'`). Parameters and local variables use `$name`, and `result`/defaults/local-var values flow through the Tasty DSL (units, color tokens, auto-calc, fallbacks). Works across client, SSR/RSC, and zero-runtime (`tastyStatic`) modes. Functions are injected once, globally, and never cleaned up (like `@counter-style`).

Note: `@function` is an experimental CSS feature; unsupported browsers safely ignore the rule.
