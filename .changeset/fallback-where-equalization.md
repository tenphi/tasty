---
'@tenphi/tasty': minor
---

Add the `_` fallback floor key and equalize selector specificity with `:where()`.

A standalone `_` key in a style value map defines a map-wide fallback floor: its
value **always applies** and is never turned off by higher-priority states,
which simply layer over it via the cascade. This fixes the CSS
three-valued-logic hole where a negated `@supports(...)` / container-query
default branch silently never applies (e.g. `scroll-state` is supported but a
specific `scroll-state(...)` query is unknown), leaving no rule active. `_` is
standalone-only — it cannot be combined with state logic (`_ & hovered` is
ignored with a dev warning) — and it can coexist with the bare `''` default
(`''` is the negated default, `_` is the always-on floor).

To make the additive cascade predictable, every stateful selector Tasty
generates (modifiers, pseudo-classes, `:is()`/`:not()` groups, and
`@root`/`@parent` context) is now wrapped in `:where(...)` so it carries zero
specificity. The only specificity anchors are the doubled component class
(`.tXX.tXX`) and sub-element `[data-element]` attributes; overlapping rules
resolve purely by source order, which Tasty now emits ascending by priority
(`@starting-style` last).

Note: state selectors drop from e.g. `0,3,0` to the class baseline `0,2,0`
specificity. This is intentional — the doubled class remains the floor — but may
affect overrides from external CSS that relied on state-selector specificity.
