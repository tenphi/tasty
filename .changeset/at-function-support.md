---
'@tenphi/tasty': minor
---

Add support for the CSS `@function` at-rule (custom functions), unify function configuration under a single `functions` key, and add an opt-in `@function` polyfill.

Define reusable, parameterized CSS functions via the `'@function'` styles key, the `useFunction` hook, or `configure({ functions })`. Functions are defined with `$$name` keys and invoked with the `$$name(...)` sugar (e.g. `marginTop: '$$negative(10px)'`). Parameters and local variables use `$name`, and `result`/defaults/local-var values flow through the Tasty DSL (units, color tokens, auto-calc, fallbacks). Works across client, SSR/RSC, and zero-runtime (`tastyStatic`) modes. Functions are injected once, globally, and never cleaned up (like `@counter-style`). A component-local `@function` definition overrides a global `configure()` definition of the same name.

**Unified `functions` config (breaking for the previously-shipped `funcs`/`function` keys):** the separate `funcs` (JS parse-time functions) and `function` (declarative CSS functions) config and plugin keys are replaced by a single `functions` map, discriminated by value type — a bare key with a function value is a parse function (`name(...)`), and a `$$name` key with an object value is a CSS `@function` definition (`$$name(...)`). A key whose prefix doesn't match its value type is ignored with a dev-mode warning.

**`@function` polyfill:** enable `configure({ polyfills: { functions: true } })` to inline every `$$name(...)` call into plain CSS (`calc()`/`var()`/`color-mix()`) at parse time instead of emitting the native `@function` rule. This brings `@function` support to browsers that don't ship the at-rule yet (Firefox/Safari) and works across all rendering modes. Limitations: no native fallback, conditional results are inlined verbatim, typed params/`returns` are dropped, and recursive functions are left untouched.

Note: native `@function` is an experimental CSS feature; without the polyfill, unsupported browsers safely ignore the rule.
