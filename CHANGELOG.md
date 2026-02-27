# @tenphi/tasty

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
