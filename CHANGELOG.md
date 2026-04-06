# @tenphi/tasty

## 1.4.2

### Patch Changes

- [#104](https://github.com/tenphi/tasty/pull/104) [`2f4576e`](https://github.com/tenphi/tasty/commit/2f4576ee665212de48253ae558498ec91f38e9b5) Thanks [@tenphi](https://github.com/tenphi)! - Relax `filterBaseProps` generic constraint from `Record<string, unknown>` to `object` so composed prop types (built from `Omit`/intersections) are accepted without requiring a string index signature.

## 1.4.1

### Patch Changes

- [#102](https://github.com/tenphi/tasty/pull/102) [`0a3a431`](https://github.com/tenphi/tasty/commit/0a3a431c01c5a838958d0ebc4f63539c54fd4d2b) Thanks [@tenphi](https://github.com/tenphi)! - Make `filterBaseProps` generic so callers can pass strongly-typed props without casting; return `Partial<T>` to preserve value types.

## 1.4.0

### Minor Changes

- [#101](https://github.com/tenphi/tasty/pull/101) [`e3847c1`](https://github.com/tenphi/tasty/commit/e3847c1e4629b74cec5b214c91acf1ed42b21de5) Thanks [@tenphi](https://github.com/tenphi)! - Add popularity-aware garbage collector for unused styles. Tracks per-className usage with DOM safety guard — styles visible in the DOM are never evicted. Exposes `gc()`, `maybeGC()`, and `touch()` APIs, with optional automatic background sweep via `configure({ gc: { auto: true } })`. Removes old dead-code auto-cleanup pipeline.

### Patch Changes

- [#99](https://github.com/tenphi/tasty/pull/99) [`b183c93`](https://github.com/tenphi/tasty/commit/b183c93d65c0702b35a8c8f06b85176937675fda) Thanks [@tenphi](https://github.com/tenphi)! - Remove `TastySSRContext` React context from SSR pipeline. All hooks now discover the SSR collector via the same global getter used by `computeStyles()`, eliminating the need for a React context Provider in `TastyRegistry`. This simplifies the SSR architecture to a single collector discovery mechanism.

## 1.3.0

### Minor Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`3d06dba`](https://github.com/tenphi/tasty/commit/3d06dba9050487291c410920f0540f9548e56f9a) Thanks [@tenphi](https://github.com/tenphi)! - Make tasty() components hook-free and compatible with React Server Components. Styles are now computed synchronously via `computeStyles()`, removing the need for `'use client'` directives. SSR collectors are discovered via AsyncLocalStorage. Removes dead code: `stringifyTokens`, top-level `allocateClassName`, and `trackRef` wrappers.

- [#95](https://github.com/tenphi/tasty/pull/95) [`310e08f`](https://github.com/tenphi/tasty/commit/310e08fbf6f7e2a317b228f89ad94446d50c28a6) Thanks [@tenphi](https://github.com/tenphi)! - Add `tokenProps` option to `tasty()` for exposing token keys as top-level component props. Supports array form (with `Color` suffix convention for color tokens) and object form (explicit `$`/`#` mapping).

### Patch Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`7eae685`](https://github.com/tenphi/tasty/commit/7eae685ef8346e601c7215c4e6a769e8222fb835) Thanks [@tenphi](https://github.com/tenphi)! - Add RSC inline style emission — tasty() components now render correctly as React Server Components by emitting inline `<style>` tags when no SSR collector or DOM is available.

- [#98](https://github.com/tenphi/tasty/pull/98) [`4adfd20`](https://github.com/tenphi/tasty/commit/4adfd2032c293859d1b68e424246eb9d7f407c55) Thanks [@tenphi](https://github.com/tenphi)! - Make internal properties overridable via `configure({ properties })` by merging user properties on top of defaults. Add `#clear` (transparent) and `#border` (rgb(0 0 0)) color tokens.

## 1.2.0

### Minor Changes

- [#94](https://github.com/tenphi/tasty/pull/94) [`ef3adef`](https://github.com/tenphi/tasty/commit/ef3adefee0ec4d87cc1d936f9ea5d7ce237ffe53) Thanks [@tenphi](https://github.com/tenphi)! - Add `longhand` modifier to force longhand CSS output for radius, padding, margin, scroll-margin, inset, and border style handlers.

- [#92](https://github.com/tenphi/tasty/pull/92) [`f1bf654`](https://github.com/tenphi/tasty/commit/f1bf6544c0f2881326ba804c6e49d1bdd01e9cc8) Thanks [@tenphi](https://github.com/tenphi)! - Overhaul style handler system with CSS-wide keyword support, directional factory, unified placement, and new scrollMargin style.
  - All style handlers now accept CSS-wide keywords (`initial`, `inherit`, `revert`, `unset`, `revert-layer`) where semantically valid
  - New `scrollMargin` style with full directional, block/inline, and priority support
  - Unified `placementStyle` handler replaces separate `align`, `justify`, and `place` with hierarchical priority (longhands override shorthands)
  - Shared directional factory eliminates code duplication across `padding`, `margin`, `inset`, and `scrollMargin`
  - Standardized handler return types to `null` for no-output
  - Fixed `preset` fontStyle handling for non-inherit CSS-wide keywords

- [#88](https://github.com/tenphi/tasty/pull/88) [`a0b1a05`](https://github.com/tenphi/tasty/commit/a0b1a05cda077823cbd40fced85477b986340c95) Thanks [@tenphi](https://github.com/tenphi)! - Add `mode: 'inject'` option to the Babel plugin. In inject mode, CSS is embedded inline in JS and injected at runtime via a tiny injector (`@tenphi/tasty/static/inject`), making `tastyStatic` calls self-contained. Ideal for reusable components and extensions.

### Patch Changes

- [#90](https://github.com/tenphi/tasty/pull/90) [`270ab75`](https://github.com/tenphi/tasty/commit/270ab75185b24233930b2e77b26235fd93f3bf70) Thanks [@tenphi](https://github.com/tenphi)! - Add `inherit` support for the `radius` style property. Standalone `radius="inherit"` outputs `border-radius: inherit`. With directional modifiers (e.g. `radius="inherit right"`), longhand properties are used since CSS-wide keywords cannot be mixed with other values.

## 1.1.0

### Minor Changes

- [#71](https://github.com/tenphi/tasty/pull/71) [`daa6704`](https://github.com/tenphi/tasty/commit/daa6704c869e5edf961cf42cf1e9c49fed365f2b) Thanks [@tenphi](https://github.com/tenphi)! - Switch preset modifier syntax from space-separated (`h2 strong`) to slash-separated (`h2 / strong`). Mod-only shorthand like `preset="bold"` is supported (equivalent to `inherit / bold`).

## 1.0.0

### Major Changes

- [`a25af0b`](https://github.com/tenphi/tasty/commit/a25af0bd75b08c85fbda9f25a948dbc8356a82fc) Thanks [@tenphi](https://github.com/tenphi)! - Promote to stable 1.0.0 release.

## 0.17.1

### Patch Changes

- [#68](https://github.com/tenphi/tasty/pull/68) [`9dd1e81`](https://github.com/tenphi/tasty/commit/9dd1e81afd6fdca6f36e9fe52da85a49c0fd9879) Thanks [@tenphi](https://github.com/tenphi)! - Preserve canonical casing for CSS transform function names (e.g. `translateX`, `scaleY`) in parser output instead of lowercasing them.

## 0.17.0

### Minor Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`2b8620a`](https://github.com/tenphi/tasty/commit/2b8620ab70ffd76f8e0f3ac809ce9408b4c2f5e2) Thanks [@tenphi](https://github.com/tenphi)! - Remove `--line-height` CSS custom property from presets and drop the `lh` custom unit in favor of the native CSS `lh` unit.

### Patch Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`4dbcdea`](https://github.com/tenphi/tasty/commit/4dbcdea94955e0b1358c0b44e7d63bb0486fcc6f) Thanks [@tenphi](https://github.com/tenphi)! - Remove unused `--font-style` CSS custom property from preset style output.

## 0.16.1

### Patch Changes

- [#64](https://github.com/tenphi/tasty/pull/64) [`1372f31`](https://github.com/tenphi/tasty/commit/1372f31f038e9e06b6ff562aad9473386dba3dc7) Thanks [@tenphi](https://github.com/tenphi)! - Nest `@starting-style` inside selector rules instead of wrapping as an outer at-rule. Fixes complex styles not applying `@starting-style` correctly.

## 0.16.0

### Minor Changes

- [#59](https://github.com/tenphi/tasty/pull/59) [`55eadac`](https://github.com/tenphi/tasty/commit/55eadac85a885138c10aa876697c51e79fbf4eab) Thanks [@tenphi](https://github.com/tenphi)! - Rename default font CSS custom properties: `--font` → `--font-sans`, `--monospace-font` → `--font-mono` to align with Tailwind/Next.js conventions.

- [#59](https://github.com/tenphi/tasty/pull/59) [`6ceb4cf`](https://github.com/tenphi/tasty/commit/6ceb4cf2495d0aa02ef01b7d5452af6024db3c06) Thanks [@tenphi](https://github.com/tenphi)! - Add @font-face and @counter-style at-rule support via `useFontFace` / `useCounterStyle` hooks, global `configure()` options, injector methods, SSR collection, and zero-runtime extraction.

### Patch Changes

- [#63](https://github.com/tenphi/tasty/pull/63) [`beaf6ce`](https://github.com/tenphi/tasty/commit/beaf6ce89148b8efdba415123337d3cac9a76c2d) Thanks [@tenphi](https://github.com/tenphi)! - Remove custom `fs` unit and `--font-size` CSS variable from preset output. Use native CSS `em` unit instead.

- [#62](https://github.com/tenphi/tasty/pull/62) [`a27dede`](https://github.com/tenphi/tasty/commit/a27dedeb1b619d8f0843756c2808c3533152282c) Thanks [@tenphi](https://github.com/tenphi)! - Replace INTERNAL_TOKENS `:root` injection with `@property` font-stack fallbacks and CSS `var()` defaults

## 0.15.3

### Patch Changes

- [`a68b132`](https://github.com/tenphi/tasty/commit/a68b1320db8a1523d7c6a388f9700217bcc4c6ee) Thanks [@tenphi](https://github.com/tenphi)! - Fix `configure()` unconditionally resetting `colorSpace` to `'oklch'` on every call, even when `colorSpace` is not provided. Now `colorSpace` follows the same merge semantics as other config options — it is only changed when explicitly passed.

## 0.15.2

### Patch Changes

- [#56](https://github.com/tenphi/tasty/pull/56) [`955caa9`](https://github.com/tenphi/tasty/commit/955caa9e917f86880d462a29b16ac997b2be515c) Thanks [@tenphi](https://github.com/tenphi)! - Fix type error where JSX elements were not assignable as children of tasty components due to `ResolveModProps` producing a catch-all index signature and `AllHTMLAttributes` intersection narrowing tag-specific attribute types.

- [#58](https://github.com/tenphi/tasty/pull/58) [`c89dc3e`](https://github.com/tenphi/tasty/commit/c89dc3e0e03ca8a21f89bb6b2cff331427c38ff0) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack: prevent non-contributing files from overwriting `tasty.css` with tokens-only content.

## 0.15.1

### Patch Changes

- [#55](https://github.com/tenphi/tasty/pull/55) [`24ae87b`](https://github.com/tenphi/tasty/commit/24ae87b4254a6abefa3bd39aa876fb1fc21d9529) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack by persisting CSSWriter across per-file Babel invocations.

- [#53](https://github.com/tenphi/tasty/pull/53) [`107c1bc`](https://github.com/tenphi/tasty/commit/107c1bc060a6508e9dff686515d5c08dd91aed1f) Thanks [@tenphi](https://github.com/tenphi)! - Group design tokens with the same state map into a single CSS rule to reduce output size.

## 0.15.0

### Minor Changes

- [#51](https://github.com/tenphi/tasty/pull/51) [`d2dc330`](https://github.com/tenphi/tasty/commit/d2dc3307bc7c01e2d4e3e9a310facaf267b96d81) Thanks [@tenphi](https://github.com/tenphi)! - Add `modProps` option to `tasty()` for exposing modifier keys as typed component props. Supports array form and object form with type descriptors (`Boolean`, `String`, `Number`, enum arrays) for full TypeScript autocomplete. Mod props merge with `mods` (mod props take precedence).

## 0.14.2

### Patch Changes

- [#49](https://github.com/tenphi/tasty/pull/49) [`63bb6ec`](https://github.com/tenphi/tasty/commit/63bb6ecc69031bc72a83d66e25786f90cc1398a8) Thanks [@tenphi](https://github.com/tenphi)! - Fix sub-element `$` selector affix for bare HTML tag names: `$: "h1"` now produces `{root} h1` instead of `{root} h1 [data-element="..."]`. Add support for the `*` universal selector in affix patterns.

## 0.14.1

### Patch Changes

- [#47](https://github.com/tenphi/tasty/pull/47) [`f5c237f`](https://github.com/tenphi/tasty/commit/f5c237f8aca633db5fd364eab2364def3e083367) Thanks [@tenphi](https://github.com/tenphi)! - Improve color style types: extract reusable `ColorValue` type, add `hsl()`, `okhsl()`, `oklch()` autocomplete hints, remove deprecated `rgba()`, document double-color fill syntax.

## 0.14.0

### Minor Changes

- [#43](https://github.com/tenphi/tasty/pull/43) [`2be334c`](https://github.com/tenphi/tasty/commit/2be334c5b60ab934496dab834e4a862e0ace2c3c) Thanks [@tenphi](https://github.com/tenphi)! - Add configurable color space for decomposed color token companion variables (`configure({ colorSpace })`) with `oklch` as the new default.

  **Breaking:** The default companion variable suffix changed from `-rgb` to `-oklch`. Any external CSS referencing `--name-color-rgb` variables directly will need to either:
  - Set `configure({ colorSpace: 'rgb' })` to restore the previous behavior, or
  - Update references to use `--name-color-oklch` instead.

  Also unifies color conversion with shared OKHSL/sRGB math, improves OKHSL plugin and token handling, and updates related docs.

### Patch Changes

- [#46](https://github.com/tenphi/tasty/pull/46) [`7b4917f`](https://github.com/tenphi/tasty/commit/7b4917fcb23b920bd2b77351112144ad954740af) Thanks [@tenphi](https://github.com/tenphi)! - Update runtime benchmark numbers and add practical performance summary to README.

- [#45](https://github.com/tenphi/tasty/pull/45) [`c6809fd`](https://github.com/tenphi/tasty/commit/c6809fdf08e227de805a6fb6f78708e2d1290c79) Thanks [@tenphi](https://github.com/tenphi)! - Refactor tastyDebug: reduce API to 8 methods, log by default (use `{ raw: true }` to suppress), add rule counts to summary/inspect, add `{ source: true }` for original CSS inspection, simplify prettifyCSS.

- [#43](https://github.com/tenphi/tasty/pull/43) [`e29d47e`](https://github.com/tenphi/tasty/commit/e29d47e7614673bb3b1b0c1b81ca4f0658ba95bf) Thanks [@tenphi](https://github.com/tenphi)! - Fix alpha channel being stripped during color space conversion, restoring transparent color tokens for fade masks and other styles.

- [#43](https://github.com/tenphi/tasty/pull/43) [`5f1ce82`](https://github.com/tenphi/tasty/commit/5f1ce82d4b80e20f2f19460cebdab9605952c8a5) Thanks [@tenphi](https://github.com/tenphi)! - Support CSS named colors (e.g. `purple`, `coral`) as color token values without emitting parse warnings.

## 0.13.1

### Patch Changes

- [#40](https://github.com/tenphi/tasty/pull/40) [`cbe5db3`](https://github.com/tenphi/tasty/commit/cbe5db38718eba80437f6521cda86db801df8c94) Thanks [@tenphi](https://github.com/tenphi)! - Auto-inject generated CSS in zero-runtime mode

  The Babel plugin now automatically replaces `@tenphi/tasty/static` imports with an import of the generated CSS file, eliminating the need to manually add `import '@/public/tasty.css'` in layout files. An empty CSS stub is created before the first build to avoid resolution errors on fresh clones. Controlled via the `injectImport` option (defaults to `true`).

- [#42](https://github.com/tenphi/tasty/pull/42) [`75b5fa0`](https://github.com/tenphi/tasty/commit/75b5fa02d49d58ed85ebf6c71889d5a1efc20cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize CSS selectors: merge OR branches into `:is()`/`:not()` groups for `@root`, `@own`, and base modifier/pseudo conditions; sort conditions for canonical output; unify `ParentGroup` with `SelectorGroup`.

## 0.13.0

### Minor Changes

- [`7270a67`](https://github.com/tenphi/tasty/commit/7270a67394696b0efd8a62f69ba28ee9c74ffc85) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).
  - Set `experimental.turbopackUseBuiltinBabel: true` in the returned config to silence the manual babel-loader warning while preserving compatibility with user `.babelrc` configs.

## 0.12.0

### Minor Changes

- [#37](https://github.com/tenphi/tasty/pull/37) [`c049bfd`](https://github.com/tenphi/tasty/commit/c049bfd7025ab8709b2296921f0fb802f597b0de) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).

## 0.11.0

### Minor Changes

- [#36](https://github.com/tenphi/tasty/pull/36) [`39b2d4d`](https://github.com/tenphi/tasty/commit/39b2d4d721d7cd0bdf220e0da4838d37d6f93acf) Thanks [@tenphi](https://github.com/tenphi)! - Remove predefined design-system tokens (colors, sizes, spacing, shadows, layout, base) from the package. These tokens belong to consuming design systems (e.g. `@cube-dev/ui-kit`), not to the styling engine itself.

  The `TypographyPreset` interface and `generateTypographyTokens()` utility remain available. Built-in CSS properties (`$gap`, `$radius`, `$border-width`, `$outline-width`, `$transition`, `$sharp-radius`, `$bold-font-weight`, `#white`, `#black`) in `INTERNAL_PROPERTIES` are unaffected.

- [#36](https://github.com/tenphi/tasty/pull/36) [`ed929cc`](https://github.com/tenphi/tasty/commit/ed929cc48f14c6fce5d191c6480d30ab234adec3) Thanks [@tenphi](https://github.com/tenphi)! - Refactor token system: `configure({ tokens })` now injects CSS custom properties on `:root` with state map support

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
      $gap: '8px',
      '#primary': {
        '': '#purple',
        '@dark': '#light-purple',
      },
    },
  });
  ```

### Patch Changes

- [`6a7972a`](https://github.com/tenphi/tasty/commit/6a7972a9933127f824f9395ecc4483187bff6952) Thanks [@tenphi](https://github.com/tenphi)! - Move `jiti` from `dependencies` to optional `peerDependencies` since it is only needed by the Next.js zero-runtime wrapper (`@tenphi/tasty/next`). Document requirements for SSR and zero-runtime entry points.

## 0.10.1

### Patch Changes

- [`ff3cdf8`](https://github.com/tenphi/tasty/commit/ff3cdf86abacd2688d6862504c29471f15d66498) Thanks [@tenphi](https://github.com/tenphi)! - Add name-based `--*-opacity` suffix rule to `autoPropertyTypes`: custom properties ending with `-opacity` are now automatically typed as `<number> | <percentage>` with initial value `0`, enabling smooth CSS transitions for opacity values.

## 0.10.0

### Minor Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`d5bec8b`](https://github.com/tenphi/tasty/commit/d5bec8b91a60e183033a4829dd23ac683f927037) Thanks [@tenphi](https://github.com/tenphi)! - Add server-side rendering (SSR) support with zero-cost client hydration. New entry points: `@tenphi/tasty/ssr`, `@tenphi/tasty/ssr/next`, `@tenphi/tasty/ssr/astro`. Next.js App Router (`TastyRegistry`), Astro (`tastyMiddleware`), and generic framework integration via `ServerStyleCollector`, `TastySSRContext`, `runWithCollector`, and `hydrateTastyCache`. Requires React 19+.

### Patch Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`f39678d`](https://github.com/tenphi/tasty/commit/f39678d3071979d5847aea067a349bd97fcfd806) Thanks [@tenphi](https://github.com/tenphi)! - Upgrade auto-inferred `@property` types: length and percentage values now register as `<length-percentage>` instead of separate `<length>`/`<percentage>`, enabling smooth transitions between mixed units. Add name-based inference for `--*-line-height` properties as `<number> | <length-percentage>`.

## 0.9.0

### Minor Changes

- [#31](https://github.com/tenphi/tasty/pull/31) [`5852321`](https://github.com/tenphi/tasty/commit/5852321733f97170a4d6cb5b62b898d8afde22a3) Thanks [@tenphi](https://github.com/tenphi)! - Simplify scrollbar style handler to use standard CSS properties only (`scrollbar-width`, `scrollbar-color`, `scrollbar-gutter`), removing all `::-webkit-scrollbar-*` pseudo-element logic and the `styled` modifier.

## 0.8.0

### Minor Changes

- [#28](https://github.com/tenphi/tasty/pull/28) [`cf339c4`](https://github.com/tenphi/tasty/commit/cf339c44943c6efe3d4d11910811f04aed00e79f) Thanks [@tenphi](https://github.com/tenphi)! - Consolidate `@parent()` OR branches into a single `:is()`/`:not()` wrapper with comma-separated selector arguments instead of expanding to separate selectors.

- [#28](https://github.com/tenphi/tasty/pull/28) [`361b5a1`](https://github.com/tenphi/tasty/commit/361b5a10518cd95148bb857612e90795a6f0a124) Thanks [@tenphi](https://github.com/tenphi)! - Add support for `:is()`, `:has()`, `:not()`, and `:where()` pseudo-classes in state keys with automatic element name transformation and `:not()` normalization.

## 0.7.1

### Patch Changes

- [#26](https://github.com/tenphi/tasty/pull/26) [`bbb1e4b`](https://github.com/tenphi/tasty/commit/bbb1e4b0bcaaf02ba3ea6f105339022e2f6bb682) Thanks [@tenphi](https://github.com/tenphi)! - Fix `@property` type inference for bare zero values. A value of `0` is ambiguous in CSS (could be `<length>`, `<angle>`, `<percentage>`, etc.), so it is no longer inferred as `<number>`. This prevents incorrect `@property` registrations that would reject subsequent typed values like `10px`.

## 0.7.0

### Minor Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`9941b40`](https://github.com/tenphi/tasty/commit/9941b40895c771691cbf1bfe28245c6d237de7a3) Thanks [@tenphi](https://github.com/tenphi)! - Auto-infer CSS @property types from custom property values. Supports `<number>`, `<length>`, `<angle>`, `<percentage>`, `<time>`, and `<color>` with deferred var() chain resolution. Controlled by `autoPropertyTypes` config flag (default: true). Adds named CSS color support to `strToRgb`.

### Patch Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`871841f`](https://github.com/tenphi/tasty/commit/871841f47c88dd6df705275f39a633c25fb17cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize @property auto-inference: skip non-custom-property declarations early, bypass token parsing indirection, remove color value detection and type mismatch validation overhead.

- [#24](https://github.com/tenphi/tasty/pull/24) [`cb219ee`](https://github.com/tenphi/tasty/commit/cb219eed6cdcc9b85b3306c7faa2e44665ef69df) Thanks [@tenphi](https://github.com/tenphi)! - Support two-color fill alongside background image by combining both layers in background-image.

## 0.6.0

### Minor Changes

- [#21](https://github.com/tenphi/tasty/pull/21) [`2546c41`](https://github.com/tenphi/tasty/commit/2546c4151a60194eac115e13cc07bcee00ea0636) Thanks [@tenphi](https://github.com/tenphi)! - Add extend-mode state maps: base styles with state maps lacking a `''` key are now applied after variant merge, allowing shared state overrides across all variants.

## 0.5.4

### Patch Changes

- [#18](https://github.com/tenphi/tasty/pull/18) [`52e4fc3`](https://github.com/tenphi/tasty/commit/52e4fc37955c9dd361bee56d9987df85aaa03406) Thanks [@tenphi](https://github.com/tenphi)! - Improve pipeline internals: add XOR chain-depth guard, consolidate duplicated deduplication/superset/absorption functions, ensure deterministic variant ordering, optimize string building in selector transform, add LRU and WeakMap caches for hot paths, introduce structured warning system with configurable handler, enable noImplicitAny across the codebase, and expand test coverage for XOR, range merging, absorption, and deduplication edge cases.

## 0.5.3

### Patch Changes

- [#16](https://github.com/tenphi/tasty/pull/16) [`caf461a`](https://github.com/tenphi/tasty/commit/caf461a8ada6f897ef3f8ebe35d1d1d2af516efb) Thanks [@tenphi](https://github.com/tenphi)! - Add top-level `types`, `main`, and `module` fields for compatibility with `moduleResolution: "node"`.

## 0.5.2

### Patch Changes

- [#14](https://github.com/tenphi/tasty/pull/14) [`d761080`](https://github.com/tenphi/tasty/commit/d7610807ac56b13052b92fc2f1fb427180d924a1) Thanks [@tenphi](https://github.com/tenphi)! - Extract style properties reference into dedicated docs/styles.md with comprehensive coverage of all custom-handled props, values, modifiers, and recommendations.

## 0.5.1

### Patch Changes

- [`2fd0a9e`](https://github.com/tenphi/tasty/commit/2fd0a9e6a1d27815878ff3c114a7e0c682aaffcb) Thanks [@tenphi](https://github.com/tenphi)! - Add eslint config file for tasty validation.

## 0.5.0

### Minor Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`4868455`](https://github.com/tenphi/tasty/commit/48684550c808d2235344aec223385234ed58d46a) Thanks [@tenphi](https://github.com/tenphi)! - Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, correctly preserving OR branches as separate selector variants and unifying their internal representation as modifier/pseudo conditions.

  **Breaking:** `@parent` direct-child syntax changed from `@parent(cond >)` to `@parent(cond, >)`. The `,` is reserved exclusively for separating the `>` direct-child flag; use `|` for OR logic inside `@parent()`.

  **Fixed:** `@parent(a) & @parent(b)` now correctly produces two independent `:is()` wrappers that can match different ancestors. Use `@parent(a & b)` when the same ancestor must satisfy both conditions.

### Patch Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`d858e95`](https://github.com/tenphi/tasty/commit/d858e959633a0e2818437137c5d56eaf58c97762) Thanks [@tenphi](https://github.com/tenphi)! - Fix parent group dedup key missing negation, guard selector dedup against non-exact operators, and simplify materialization internals.

## 0.4.2

### Patch Changes

- [`e6a6982`](https://github.com/tenphi/tasty/commit/e6a6982c1db6a75bfce0ca00f11452a25e7102e6) Thanks [@tenphi](https://github.com/tenphi)! - Drop `react-is` dependency by replacing `isValidElementType` with a lightweight internal utility. Move `@babel/helper-plugin-utils` and `@babel/types` from dependencies to optional peer dependencies since they are only needed for the Babel plugin entry point.

## 0.4.1

### Patch Changes

- [`27bc1bf`](https://github.com/tenphi/tasty/commit/27bc1bfe81e8f93f10f9d3496fefab506b4e7fa8) Thanks [@tenphi](https://github.com/tenphi)! - Add missing exports.

## 0.4.0

### Minor Changes

- [#7](https://github.com/tenphi/tasty/pull/7) [`92b700e`](https://github.com/tenphi/tasty/commit/92b700eff8007e6307d0afa894c56ab8e86f8e2f) Thanks [@tenphi](https://github.com/tenphi)! - Add `@tenphi/tasty/core` entry point exporting the full framework-agnostic styling engine (config, pipeline, parser, injector, styles, plugins, states, chunks, utils, types). This enables building tasty integrations for non-React frameworks and tools like eslint plugins without depending on React.

  Remove `@tenphi/tasty/parser` entry point — its exports are now available via `@tenphi/tasty/core`.

  Replace internal `CSSProperties` imports from React with `csstype`, extracted into a shared `CSSProperties` type alias. Also export `InnerStyleProps` (previously missing from public API).

## 0.3.0

### Minor Changes

- [#5](https://github.com/tenphi/tasty/pull/5) [`13ecc70`](https://github.com/tenphi/tasty/commit/13ecc70e7c434e009114668e095a652ad72fec8e) Thanks [@tenphi](https://github.com/tenphi)! - Change recipe syntax separator from `|` to `/` and add support for `none` value to disable base recipes.

## 0.2.0

### Minor Changes

- [#3](https://github.com/tenphi/tasty/pull/3) [`a49afea`](https://github.com/tenphi/tasty/commit/a49afea07306630ab213fe5d1b3c599b8f607f6c) Thanks [@tenphi](https://github.com/tenphi)! - Add @parent() state for styling based on parent element state (e.g. @parent(hovered), @parent(theme=dark >) for direct parent).

## 0.1.3

### Patch Changes

- [`d95087e`](https://github.com/tenphi/tasty/commit/d95087ea4c631abec255c1268daa3055da3e0e5f) Thanks [@tenphi](https://github.com/tenphi)! - Export `StyleParser`, types, and `Bucket` enum via new `@tenphi/tasty/parser` sub-path for use by external tooling (e.g., ESLint plugin).

## 0.1.2

### Patch Changes

- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
- Deduplicate CI builds on push to main

## 0.1.1

### Patch Changes

- [`ac38577`](https://github.com/tenphi/tasty/commit/ac3857771ffd88971e110517ac185044e4b1ad31) Thanks [@tenphi](https://github.com/tenphi)! - Fix node-targeted subpaths (babel-plugin, zero, next) outputting .mjs instead of .js by unifying tsdown build config into a single browser-platform entry
- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
