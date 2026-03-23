# @tenphi/tasty

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
