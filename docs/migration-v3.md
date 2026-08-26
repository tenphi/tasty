# Migration Guide: v2 → v3

Everything that changes when you upgrade from `@tenphi/tasty` 2.x to 3.0, in the order you will hit it.

Most of the work is mechanical renames — see the [search-and-replace cheat sheet](#search-and-replace-cheat-sheet) at the end. The parts that need real attention are the [directional shorthand](#2-directional-shorthand) rule and the [behavior changes](#8-behavior-changes-that-are-not-renames).

- [At a glance](#at-a-glance)
- [1. Styles-object keys](#1-styles-object-keys)
- [2. Directional shorthand](#2-directional-shorthand)
- [3. Config keys](#3-config-keys)
- [4. Renamed exports](#4-renamed-exports)
- [5. Removed exports](#5-removed-exports)
- [6. Removed props](#6-removed-props)
- [7. Moved subpath](#7-moved-subpath)
- [8. Behavior changes that are not renames](#8-behavior-changes-that-are-not-renames)
- [9. New in v3](#9-new-in-v3)
- [Search-and-replace cheat sheet](#search-and-replace-cheat-sheet)
- [Not changed](#not-changed)

---

## At a glance

| v2.11                           | v3.0                              | Find it with                   |
| ------------------------------- | --------------------------------- | ------------------------------ |
| `'@properties': { … }`          | `'@property': { … }`              | `rg "'@properties'"`           |
| `'@fontFace': { … }`            | `'@font-face': { … }`             | `rg "'@fontFace'"`             |
| `'@counterStyle': { … }`        | `'@counter-style': { … }`         | `rg "'@counterStyle'"`         |
| `padding: '2x 4x top right'`    | `padding: '2x top, 4x right'`     | dev-mode console warning       |
| `fade: '3x 1x top bottom'`      | `fade: '3x top, 1x bottom'`       | dev-mode console warning       |
| `configure({ funcs })`          | `configure({ functions })`        | `rg "funcs"`                   |
| `configure({ fontFace })`       | `configure({ fontFaces })`        | `rg "fontFace:"`               |
| `configure({ counterStyle })`   | `configure({ counterStyles })`    | `rg "counterStyle:"`           |
| `getCssText()`                  | `getCSSText()`                    | `rg "getCssText"`              |
| `getCssTextForNode()`           | `getCSSTextForNode()`             | `rg "getCssTextForNode"`       |
| `getCssTextForClasses()`        | `getCSSTextForClasses()`          | `rg "getCssTextForClasses"`    |
| `getGlobalFontFace()`           | `getGlobalFontFaces()`            | `rg "getGlobalFontFace\b"`     |
| `getGlobalCounterStyle()`       | `getGlobalCounterStyles()`        | `rg "getGlobalCounterStyle\b"` |
| `getGlobalFunction()`           | `getGlobalFunctions()`            | `rg "getGlobalFunction\b"`     |
| `okhslFunc` / `okhstFunc`       | `okhslFunction` / `okhstFunction` | `rg "okhs[lt]Func\b"`          |
| `CssOptions`                    | `CSSOptions`                      | `rg "CssOptions"`              |
| `ParserOptions.funcs`           | `ParserOptions.functions`         | `rg "funcs:"`                  |
| `StyleParser#setFuncs()`        | `StyleParser#setFunctions()`      | `rg "setFuncs"`                |
| `ChunkInfo` (from `tastyDebug`) | `DebugChunkInfo`                  | `rg "ChunkInfo"`               |
| `@tenphi/tasty/next`            | `@tenphi/tasty/zero/next`         | `rg "tasty/next"`              |
| `getIsTestEnvironment()`        | `isTestEnvironment()`             | `rg "getIsTestEnvironment"`    |
| `hydrateTastyCache()`           | `hydrateTastyClasses()`           | `rg "hydrateTastyCache"`       |

---

## 1. Styles-object keys

At-rule keys now match the real CSS at-rule names Tasty already emits, so they are kebab-case rather than camelCase. The generated CSS is unchanged.

```diff
  const Card = tasty({
    styles: {
-     '@properties': { '$elevation': { syntax: '<number>' } },
-     '@fontFace': { Inter: { src: 'url(/inter.woff2)' } },
-     '@counterStyle': { dashes: { system: 'cyclic', symbols: '"—"' } },
+     '@property': { '$elevation': { syntax: '<number>' } },
+     '@font-face': { Inter: { src: 'url(/inter.woff2)' } },
+     '@counter-style': { dashes: { system: 'cyclic', symbols: '"—"' } },
    },
  });
```

`@keyframes` and `@starting` are unchanged — they were already spec-faithful.

---

## 2. Directional shorthand

**This is the one change that can alter rendered CSS without a rename.** A style group that names direction modifiers now takes a **single** value, applied to every direction it names.

The old form looked positional but never was: the parser buckets values and modifiers into separate arrays per comma group, so `'2x 4x top right'`, `'2x top 4x right'`, and `'top 2x right 4x'` were all the same input, and the pairing was decided by the order the _modifiers_ happened to appear in. `'1x 2x right top'` and `'1x 2x top right'` produced different CSS, and `'1x 2x top top'` silently assigned `top` twice.

Per-side values now come from comma-separated groups:

```diff
- padding: '2x 4x top right'
+ padding: '2x top, 4x right'

- margin: 'right 1x top 2x'
+ margin: '1x right, 2x top'

- inset: 'left 2x right 1x'
+ inset: '2x left, 1x right'

- fade: '3x 1x top bottom'
+ fade: '3x top, 1x bottom'
```

Affects `padding`, `margin`, `inset`, `scrollMargin`, and `fade`. Extra values are ignored with a **development-mode warning** naming the offending value, so run your app in dev and watch the console — that is the reliable way to find every occurrence. Production is silent and never throws.

**Unchanged:** single-value directional groups (`padding: '2x top'`, `'1x left right'`), every value-only CSS shorthand form (`padding: '1x 2x'`, `'1x 2x 3x 4x'`, and `fade: '3x 1x'` — a group that names no direction is unambiguous and keeps plain shorthand order), CSS-wide keywords, and the `longhand` modifier.

`inset`'s `dock` modifier keeps its two-value form with sharper semantics: the first value applies to the named edge, the second to the perpendicular sides it spans, so `inset: '2x 4x bottom dock'` still gives `auto 32px 16px 32px`. A third value with `dock`, or a second value without it, now warns.

---

## 3. Config keys

```diff
  configure({
-   funcs: { double: (groups) => `calc(2 * ${groups[0].output})` },
-   fontFace: { Inter: { src: 'url(/inter.woff2)' } },
-   counterStyle: { dashes: { system: 'cyclic', symbols: '"—"' } },
+   functions: { double: (groups) => `calc(2 * ${groups[0].output})` },
+   fontFaces: { Inter: { src: 'url(/inter.woff2)' } },
+   counterStyles: { dashes: { system: 'cyclic', symbols: '"—"' } },
  });
```

`functions` is a single map holding both flavors, discriminated by value type:

- **bare key + function value** → a parse-time function, called as `name(...)`
- **`$$name` key + object value** → a declarative CSS `@function`, called as `$$name(...)`

A key whose prefix doesn't match its value type is ignored with a development warning.

> If you are coming from a pre-release build of v3, note the intermediate `function` config key never shipped. Upgraders from 2.x only ever wrote `funcs`.

---

## 4. Renamed exports

**Raw-CSS family** — aligned on the `CSS` initialism already used by `useRawCSS` / `injectRawCSS` / `getRawCSSText`:

- `getCssText()` → `getCSSText()`
- `getCssTextForNode()` → `getCSSTextForNode()`
- `StyleInjector#getCssTextForClasses()` → `getCSSTextForClasses()`
- `CssOptions` → `CSSOptions`

**Config getters** — pluralized to match their already-plural config keys:

- `getGlobalFontFace()` → `getGlobalFontFaces()`
- `getGlobalCounterStyle()` → `getGlobalCounterStyles()`
- `getGlobalFunction()` → `getGlobalFunctions()`

**Color functions** — aligned with the `useFunction` / `FunctionDefinition` family:

- `okhslFunc` → `okhslFunction`
- `okhstFunc` → `okhstFunction`
- `createColorFunc(name, channelLabel, convert)` → `createColorFunc(name, convert, label?)` — the label is now an optional trailing argument used only to format development warnings

**Parser** (`@tenphi/tasty/core`):

- `ParserOptions.funcs` → `ParserOptions.functions`
- `StyleParser#setFuncs()` → `StyleParser#setFunctions()`

**Debug types:** the debug-local `ChunkInfo` is now `DebugChunkInfo`, so it no longer collides with the parser's `ChunkInfo`.

---

## 5. Removed exports

| Removed                                                         | Use instead                                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getIsTestEnvironment()`                                        | `isTestEnvironment()`                                                                                                                                        |
| `hydrateTastyCache()`                                           | `hydrateTastyClasses()`                                                                                                                                      |
| `customFunc()`                                                  | `configure({ functions })`                                                                                                                                   |
| `getGlobalFuncs()`                                              | `getGlobalFunctions()` for `@function` definitions; the parse-function registry is internal                                                                  |
| `resetGlobalFuncs()`                                            | `resetConfig()`                                                                                                                                              |
| `setGlobalPredefinedTokens()`                                   | `configure({ replaceTokens })`                                                                                                                               |
| `resetGlobalPredefinedTokens()`                                 | `resetConfig()`                                                                                                                                              |
| `setMiddlewareTransferCache()` / `getMiddlewareTransferCache()` | internal; no replacement needed                                                                                                                              |
| `clearWriterCache()`                                            | internal test utility                                                                                                                                        |
| `DEFAULT_PLUGINS`                                               | nothing — it was never consumed, and passing it to `configure({ plugins })` was a no-op. The default `okhsl`/`okhst` functions are registered automatically. |
| `registerDefaultFunctions()`                                    | internal bootstrap helper                                                                                                                                    |
| `warn()` / `deprecationWarning()`                               | internal helpers with no callers                                                                                                                             |
| `Bucket` enum                                                   | parser-internal                                                                                                                                              |
| `Props` type                                                    | inline `Record<string, any>`                                                                                                                                 |
| `UseStylesOptions`                                              | `useStyles()` takes `Styles \| undefined` directly                                                                                                           |
| `GlobalStyledProps`                                             | its only member was the already-dead `breakpoints` prop                                                                                                      |
| duplicate `PropertyOptions`                                     | the single `PropertyOptions` from `injector/types`                                                                                                           |

`getGlobalFuncs()` deserves a note: it returned the **live mutable internal registry**, and writing to it bypassed the parser's cache invalidation, so the write silently never took effect. If you were mutating it, move to `configure({ functions })`.

---

## 6. Removed props

`css`, `block`, `inline`, and `breakpoints` are gone from `BaseProps` / `TastySpecificKeys`. All four were typed but never consumed — passing them did nothing in v2 either.

---

## 7. Moved subpath

```diff
- import { withTasty } from '@tenphi/tasty/next';
+ import { withTasty } from '@tenphi/tasty/zero/next';
```

The build-time extraction Next.js wrapper already lived under the `zero` namespace internally; the top-level `/next` path collided confusingly with `@tenphi/tasty/ssr/next`, which is a different integration.

---

## 8. Behavior changes that are not renames

**Repeated `configure()` calls now merge.** `recipes`, `keyframes`, `properties`, `fontFaces`, `counterStyles`, and CSS `@function` definitions used to replace wholesale, so a design-system `configure()` followed by an application `configure()` silently dropped the design system's values. All of them now merge, with the later call winning on a key conflict — matching `tokens` and `globalStyles`, which already merged. If you were relying on a second call to _clear_ a collection, use `resetConfig()`.

`configure({ polyfills })` is now correctly rejected after the first render, like every sibling option, and shallow-merges so an unrelated later call cannot switch a polyfill off.

**The `theme` prop is now implemented.** It maps to a `data-theme` attribute on the rendered element; previously it fell through and was spread onto the DOM raw. Augment `TastyThemeNames` for autocomplete.

**`tasty(Component, options)` no longer leaks factory-only options.** `variants`, `elements`, `styleProps`, `modProps`, and `tokenProps` are stripped instead of being passed to the wrapped component as runtime props, matching the element factory.

**Replacing a built-in style handler now warns.** Built-in handlers are shared across style names, so `configure({ handlers: { fill } })` also takes over `image` and the whole `background-*` family, and `configure({ handlers: { display } })` takes down `flow`, `gap`, `hide`, `overflow`, `whiteSpace`, and `textOverflow`. This was always true; what's new is that a development-mode warning now names exactly what was displaced. If you see it, either declare the whole group and delegate the rest to `styleHandlers.*`, or pick a narrower name. See [Plugins](plugins.md#custom-style-handlers).

**Multi-dependency custom handlers are fixed.** A handler whose dependencies mixed known and unknown style names was invoked once per chunk with only _part_ of its dependencies, and could emit stale CSS. Unknown names now join their handler's chunk, so it is invoked once with all of them. No built-in style moved, so no existing class name changes.

**`isChecked` added to the root prop types.** It already worked at runtime; it was just missing from `BaseProps` / `AllBaseProps`.

**The `okhsl`/`okhst` "expected 3 values" warning is now development-only** and follows the `[Tasty]` prefix convention: `[Tasty] okhsl(): expected 3 values (H S L), got: …`. It previously fired in production.

---

## 9. New in v3

Nothing here is required to upgrade.

- **CSS `@function` support** — reusable, parameterized functions via the `'@function'` styles key, the `useFunction` style function, or `configure({ functions })`. Works across client rendering, SSR/RSC, and build-time extraction. `configure({ polyfills: { functions: true } })` inlines every call into plain CSS for browsers that don't ship the at-rule yet. See [Style DSL](dsl.md#functions-function).
- **Custom color plugins with no core special-casing** — `okhsl`/`okhst` are now ordinary one-line plugins, and a third-party color space can achieve identical integration. New `createColorFunc` and `resolveFunctionColor` helpers.
- **`configure({ propHandlers })`** — props middleware for every component: props in, props out. The extension point for props that aren't style values.
- **`configure({ baseStyleProps })`** — expose style properties as props on every component without listing them in each `styleProps`.
- **`defineHandler(deps, fn)`** — infers a multi-dependency handler's parameter types from its dependency list.
- **Plugins can supply `properties`, `keyframes`, `fontFaces`, and `counterStyles`** in addition to what they already could.
- See [Plugins & Extension Points](plugins.md) for all of the above.

---

## Search-and-replace cheat sheet

Run these in order — the `Css` → `CSS` renames must happen before any broader pattern, and the quoted at-rule keys must stay quote-anchored so they can't hit `configure({ properties })`.

```bash
# 1. Raw-CSS family (before anything that touches "Css")
rg -l 'getCssTextForClasses' | xargs sed -i '' 's/getCssTextForClasses/getCSSTextForClasses/g'
rg -l 'getCssTextForNode'    | xargs sed -i '' 's/getCssTextForNode/getCSSTextForNode/g'
rg -l 'getCssText'           | xargs sed -i '' 's/getCssText/getCSSText/g'
rg -l 'CssOptions'           | xargs sed -i '' 's/CssOptions/CSSOptions/g'

# 2. Styles-object at-rule keys (quote-anchored)
rg -l "'@properties'"   | xargs sed -i '' "s/'@properties'/'@property'/g"
rg -l "'@fontFace'"     | xargs sed -i '' "s/'@fontFace'/'@font-face'/g"
rg -l "'@counterStyle'" | xargs sed -i '' "s/'@counterStyle'/'@counter-style'/g"

# 3. Config getters (word-anchored so the plural forms are not double-pluralized)
rg -l 'getGlobalFontFace\b'     | xargs sed -i '' 's/getGlobalFontFace\b/getGlobalFontFaces/g'
rg -l 'getGlobalCounterStyle\b' | xargs sed -i '' 's/getGlobalCounterStyle\b/getGlobalCounterStyles/g'
rg -l 'getGlobalFunction\b'     | xargs sed -i '' 's/getGlobalFunction\b/getGlobalFunctions/g'

# 4. Color functions and parser methods
rg -l 'okhslFunc\b' | xargs sed -i '' 's/okhslFunc\b/okhslFunction/g'
rg -l 'okhstFunc\b' | xargs sed -i '' 's/okhstFunc\b/okhstFunction/g'
rg -l 'setFuncs'    | xargs sed -i '' 's/setFuncs/setFunctions/g'

# 5. Removed exports with direct replacements
rg -l 'getIsTestEnvironment' | xargs sed -i '' 's/getIsTestEnvironment/isTestEnvironment/g'
rg -l 'hydrateTastyCache'    | xargs sed -i '' 's/hydrateTastyCache/hydrateTastyClasses/g'

# 6. Moved subpath
rg -l "@tenphi/tasty/next" | xargs sed -i '' "s|@tenphi/tasty/next|@tenphi/tasty/zero/next|g"

# 7. Verify nothing is left (should print nothing)
rg "getCssText|CssOptions|'@properties'|'@fontFace'|'@counterStyle'|okhs[lt]Func\b|setFuncs|getIsTestEnvironment|hydrateTastyCache|@tenphi/tasty/next|getGlobalFontFace\b|getGlobalCounterStyle\b|getGlobalFunction\b"
```

`configure({ funcs })` → `functions`, `fontFace` → `fontFaces`, and `counterStyle` → `counterStyles` are deliberately **not** scripted: those words appear in many other contexts, so change them by hand and let TypeScript find the call sites.

The directional shorthand cannot be scripted at all — the whole point is that the old form's meaning was not recoverable from its text. Run your app in development and follow the console warnings.

---

## Not changed

Worth stating explicitly, because it's easy to assume otherwise:

- **At-rule styles-object keys are CSS-spec-faithful, not JS-conventional.** `@keyframes`, `@property`, `@font-face`, `@counter-style`, `@function`, `@starting` — kebab-case, matching what Tasty emits.
- **The `func()` injector method stays abbreviated.** `function` is a reserved word.
- `injector.fontFace()` and `injector.counterStyle()` keep their singular names — only the _config keys_ and _getters_ were pluralized.
- `useFontFace` and `useCounterStyle` are unchanged.
- `configure({ properties })` and `autoPropertyTypes` are unchanged; only the styles-object `@property` key was renamed.
- **The deprecated style aliases are retained deliberately.** `backgroundColor`, `background`, `backgroundImage`, `flex`, `grid`, and `flexDirection` still carry `@deprecated` tags and still work. They are the guardrail that discourages their use in projects that have not enabled `@tenphi/eslint-plugin-tasty` yet — read the tags as guidance, not as a removal notice.
