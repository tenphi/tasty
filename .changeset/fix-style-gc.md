---
'@tenphi/tasty': minor
---

Style lifetime now follows React commits. A styled component takes up the classes its render resolved in a `useInsertionEffect` and gives them back when it unmounts; only a class that was held and then fully released is ever collected.

This replaces a model that could not work. Collection previously decided a class was finished by not finding it in the DOM, which is indistinguishable from a concurrent render that has resolved a class and not committed it yet — so a sweep could delete rules a pending render was about to attach. The new model does not try to tell those apart: a managed render writes nothing to a sheet, and the commit inserts from a recorded recipe, re-creating anything collected in between. Collecting early costs a re-insert, never a missing style.

- `gc()` and `cleanup()` collect on demand; automatic collection is driven by unmounts, via the new `gc.releaseInterval`.
- No `querySelectorAll('[class]')` anywhere — collection is map operations over what was released.
- A bare `computeStyles()` has no commit to restore it, so it injects during the call and pins the class. SSR and RSC are unaffected: the commit hook is taken only where there is a document, so `tasty()` still works as a server component.
- `touch()` is a deprecated no-op, `gc.touchInterval` gives way to `gc.releaseInterval`, and `StyleUsage` is replaced by `StyleRecipe`.
- New: `acquireStyles`, `releaseStyles`, `defineRecipe`, `resolveChunk`, `hasRecipe`.
