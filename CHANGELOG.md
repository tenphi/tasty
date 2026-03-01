# @tenphi/tasty

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
