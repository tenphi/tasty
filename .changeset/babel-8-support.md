---
'@tenphi/tasty': minor
---

`@tenphi/tasty/babel-plugin` now supports Babel 8. The optional peers `@babel/core`, `@babel/helper-plugin-utils` and `@babel/types` accept `^7.24.0 || ^8.0.0`, and Babel 7 keeps working as before. Under Babel 8, negative numbers in `tastyStatic()` styles, such as `zIndex: -1`, no longer fail the build. The plugin's published type no longer imports Babel's types, so it type-checks against Babel 7's `@types/babel__core` and Babel 8's own types alike.
