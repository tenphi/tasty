---
"@tenphi/tasty": patch
---

Improve pipeline internals: add XOR chain-depth guard, consolidate duplicated deduplication/superset/absorption functions, ensure deterministic variant ordering, optimize string building in selector transform, add LRU and WeakMap caches for hot paths, introduce structured warning system with configurable handler, enable noImplicitAny across the codebase, and expand test coverage for XOR, range merging, absorption, and deduplication edge cases.
