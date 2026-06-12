---
'@tenphi/tasty': patch
---

Fix negation of `@supports`-guarded feature queries. When an `@supports`
feature query guards a dependent query (e.g. `@supports(container-type:
scroll-state) & @(scroll-state(...))`), the default state is now emitted under
a bare `@supports (not (...))` fallback instead of a meaningless bare
`@container (not scroll-state(...))` rule. Previously the default could fail to
apply in browsers without the feature. `@supports` negation branches now sort
ahead of other at-rule branches during exclusive expansion; cases without an
`@supports` guard are unaffected.
