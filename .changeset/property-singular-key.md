---
'@tenphi/tasty': major
---

Rename the per-component/per-recipe `'@properties'` style key to `'@property'` so it matches the real CSS at-rule name (`@property`), which is what Tasty already emits. The emitted CSS (`@property --name { ... }`) is unchanged. The global config field `configure({ properties })` and the `autoPropertyTypes` flag are unchanged — only the styles-object key is renamed.

This is a breaking rename for any styles using `'@properties': { ... }`; update those keys to `'@property'`.
