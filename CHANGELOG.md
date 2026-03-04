# @tenphi/tasty

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
