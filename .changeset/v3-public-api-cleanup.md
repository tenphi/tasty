---
'@tenphi/tasty': major
---

## v3 public API cleanup

Consolidated breaking changes for the v3 major release. At-rule **styles-object keys stay CSS-spec-faithful** (`@keyframes`, `@property`, `@font-face`, `@counter-style`, `@function`, `@starting`); the `func` injector method stays abbreviated (`function` is a reserved word). Everything else is unified to JS conventions (plural where applicable), dead code is removed, and type-vs-runtime gaps are fixed.

### Breaking renames

- `getCssText()` / `getCssTextForNode()` / `StyleInjector.getCssTextForClasses()` → `getCSSText()` / `getCSSTextForNode()` / `getCSSTextForClasses()` to match the rest of the raw-CSS family (`useRawCSS`, `injectRawCSS`, `getRawCSSText`).
- Config getters pluralized to match their (already-plural) config keys: `getGlobalFontFace` → `getGlobalFontFaces`, `getGlobalCounterStyle` → `getGlobalCounterStyles`, `getGlobalFunction` → `getGlobalFunctions`.
- `okhslFunc` / `okhstFunc` → `okhslFunction` / `okhstFunction` (align with the `useFunction` / `FunctionDefinition` family).
- Next.js zero-runtime wrapper moved: `@tenphi/tasty/next` → `@tenphi/tasty/zero/next` (it already lived under the `zero` namespace; this avoids colliding with `@tenphi/tasty/ssr/next`).

### Removed from the public surface

- `getIsTestEnvironment()` — use `isTestEnvironment()` directly.
- `hydrateTastyCache()` (deprecated since 2.x) — use `hydrateTastyClasses()`.
- `setMiddlewareTransferCache()` / `getMiddlewareTransferCache()` — `@internal`-tagged helpers moved off the public `@tenphi/tasty/ssr/astro` export.
- `clearWriterCache()` — test utility removed from the `@tenphi/tasty/babel-plugin` export (still importable internally).
- `UseStylesOptions` type alias — `useStyles()` is now typed `Styles | undefined` directly.
- `PropertyOptions` (the duplicate defined in the injector barrel) — consolidated into a single `PropertyOptions` in `injector/types` (`PropertyDefinition` + `root?`). `UsePropertyOptions` is now an alias of it.
- `Bucket` enum — un-exported from `@tenphi/tasty/core` (parser-internal).
- `Props` (`Record<string, any>`) — un-exported; inline `Record<string, any>` at the wrap-overload base.
- Dead props removed from `BaseProps` / `TastySpecificKeys`: `css`, `block`, `inline`, `breakpoints` (typed but never consumed).

### Behavior / type fixes

- `theme` prop is now implemented: it maps to the `data-theme` attribute on the rendered element (previously it fell through to `otherProps` and was spread raw). Augment `TastyThemeNames` for autocomplete.
- `isChecked` added to `BaseProps` / `AllBaseProps` (it already worked at runtime via the `is*` pipeline but was missing from the root prop types).
- `tasty(Component, options)` (wrap overload) no longer leaks factory-only options (`variants`, `elements`, `styleProps`, `modProps`, `tokenProps`) onto the wrapped component as runtime props — they are stripped, matching the element factory.
- `namePrefix` JSDoc regex corrected to `^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$` (matches the validator).

### Additive (still part of this major's API surface)

- `createServerStyleCollector()` and `createCSSWriter()` factory wrappers are now the canonical entry points for the infrastructure services (the classes remain exported for advanced use).
- `TastyComponentPropsWithDefaults`, the `tastyDebug` helper types (`DebugOptions`, `CssOptions`, `InspectResult`, `CacheStatus`, `ChunkBreakdown`, `Summary`, `DebugChunkInfo`), and `PropertyOptions` are now exported. The debug-local `ChunkInfo` was renamed `DebugChunkInfo` to avoid colliding with the parser `ChunkInfo`.
