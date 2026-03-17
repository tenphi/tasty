---
'@tenphi/tasty': minor
---

Add Turbopack support for zero-runtime CSS extraction

- Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
- Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
- Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).
- Set `experimental.turbopackUseBuiltinBabel: true` in the returned config to silence the manual babel-loader warning while preserving compatibility with user `.babelrc` configs.
