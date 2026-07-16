---
'@tenphi/tasty': major
---

At-rule naming consistency.

1. Rename the per-component/per-recipe `'@fontFace'` and `'@counterStyle'` style keys to `'@font-face'` and `'@counter-style'` so they match the real CSS at-rule names Tasty already emits. Emitted CSS is unchanged; `@starting` is unaffected.

2. Pluralize the global config collection options `fontFace` → `fontFaces` and `counterStyle` → `counterStyles` for consistency with the other plural collections (`properties`, `functions`, `keyframes`). The injector methods (`injector.fontFace()` / `injector.counterStyle()`) and hooks (`useFontFace` / `useCounterStyle`) are unchanged.

Both are breaking renames. Update styles-object keys from `'@fontFace'` / `'@counterStyle'` to `'@font-face'` / `'@counter-style'`, and `configure({ fontFace, counterStyle })` to `configure({ fontFaces, counterStyles })`.
