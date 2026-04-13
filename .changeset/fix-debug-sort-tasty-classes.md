---
'@tenphi/tasty': patch
---

Fix `tastyDebug` sorting of class names. The internal `sortTastyClasses` helper still parsed class names as decimal integers, which silently produced unsorted output for the 2.0.0 base36 hash format (e.g. `t3a5f`). It now sorts lexicographically, restoring stable ordering in `tastyDebug.cache()`, `tastyDebug.summary()`, and related outputs.
