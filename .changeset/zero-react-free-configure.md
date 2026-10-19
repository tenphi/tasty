---
'@tenphi/tasty': minor
---

Add a React-free `configure()` and `resetConfig()` to `@tenphi/tasty/zero`, so Node build scripts can set units, states, recipes, keyframes and the other options that shape generated CSS without installing `react` (see the Programmatic API section of the zero-runtime docs for what it emits). Each `configure()` call replaces the previous configuration, and reconfiguring the Babel plugin no longer keeps units and state aliases removed from its config. The Babel plugin also re-applies its configuration before each file when another build-time configuration in the same process (another output, `withTastyNext()`, `/zero` `configure()`) replaced it.
