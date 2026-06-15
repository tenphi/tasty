---
'@tenphi/tasty': minor
---

Add the `@fallback` state token and equalize selector specificity with `:where()`.

`@fallback` (used as a top-level `&` atom on a state key, e.g. `'@fallback'` or
`'@fallback & hovered'`) opts an entry out of *receiving* negation from
higher-priority states, so it persists as a guaranteed floor while still
negating lower-priority states. This fixes the CSS three-valued-logic hole where
a negated `@supports(...)` / container-query default branch silently never
applies (e.g. `scroll-state` is supported but a specific `scroll-state(...)`
query is unknown), leaving no rule active.

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
