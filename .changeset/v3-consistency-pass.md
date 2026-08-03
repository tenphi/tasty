---
'@tenphi/tasty': major
---

## v3 consistency pass

Finishes the renames the rest of the v3 cleanup started, removes what was never meant to be public, and fixes a class of bug where a second `configure()` call discarded the first one's values.

### Repeated `configure()` now merges instead of replacing

`recipes`, `keyframes`, `properties`, `fontFaces`, `counterStyles`, and CSS `@function` definitions replaced wholesale, while `tokens` and `globalStyles` merged. A design-system `configure()` followed by an application `configure()` therefore silently dropped the design system's recipes, keyframes, properties, font faces, counter styles, and functions. All of them now merge, with the later call winning on a key conflict — matching what the `functions` documentation already claimed.

`configure({ polyfills })` gains the `stylesGenerated` guard every sibling option has, and shallow-merges, so an unrelated later `configure({ polyfills: {} })` no longer switches a polyfill off while an explicit `{ functions: false }` still does.

### `funcs` → `functions` on the parser surface

- `ParserOptions.funcs` → `ParserOptions.functions`
- `StyleParser.setFuncs()` → `StyleParser.setFunctions()`

### Removed from the public surface

- `customFunc`, `getGlobalFuncs`, `resetGlobalFuncs` — use `configure({ functions })`. `getGlobalFuncs()` returned the live mutable internal registry, and writing to it bypassed the parser's cache invalidation, so the write silently never took effect. They remain internally as `customFunction`, `getGlobalParseFunctions`, and `resetGlobalParseFunctions`.
- `setGlobalPredefinedTokens`, `resetGlobalPredefinedTokens` — use `configure({ replaceTokens })` and `resetConfig()`.
- `warn`, `deprecationWarning` — internal helpers with no callers.
- `DEFAULT_PLUGINS` — never consumed by anything, including `configure()`. Passing it to `configure({ plugins })` was a no-op; the default `okhsl`/`okhst` functions are registered by the parser bootstrap, which is unchanged. Also removes the unused `areDefaultFunctionsRegistered()` and `_resetDefaultFunctionsFlag()`.
- `registerDefaultFunctions` — internal bootstrap helper.
- `GlobalStyledProps` — an interface whose only member was the `breakpoints` prop already removed as dead.

The `@tenphi/tasty/core` barrel now lists the `utils/styles` exports explicitly instead of re-exporting the whole module, so internal helpers can no longer leak onto the public surface by accident.

### Renamed

- `CssOptions` → `CSSOptions`, matching the `getCSSText` / `useRawCSS` family. It was newly exported in this major, so this is its first released spelling.

### Added

- `FunctionsConfig` and `ParseFunction` are now exported. They are the declared types of the public `functions` config and plugin fields, so they were impossible to reference.

### Fixed

- The `okhsl` / `okhst` / `createColorFunc` "expected 3 values" warning fired in production and used an `[okhsl]` prefix. It is now development-only and follows the `[Tasty]` convention: `[Tasty] okhsl(): expected 3 values (H S L), got: …`.
- The "cannot update" warning for `functions` said `function`.
- `RESERVED_PREFIXES` in the state parser now includes `@font-face`, `@counter-style`, and `@function`, matching the built-in state list.
- The `useFunction` JSDoc and the `docs/react-api.md` example showed the function being called from a raw inline `style` prop, which bypasses the parser entirely — the `$$name(...)` sugar is never expanded, and under `polyfills.functions` it silently does nothing. Both now show the DSL call.

### Guardrails

A new public-API snapshot test records every export of every `package.json` subpath in `src/__snapshots__/public-api.md`, covering types as well as values. Any change to the published surface now shows up as a reviewable diff.

`knip` is now correct and runs in CI. It previously declared only test and bench files as entry points, so it could not reason about the published surface at all — which is why the dead exports above went unnoticed.
