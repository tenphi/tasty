---
'@tenphi/tasty': patch
---

Auto-correct and warn on misplaced or redundant default states in style maps.

The bare default state (`''`) is the lowest-priority state and must be the first
key in a state map. When it is authored after other states, Tasty now moves it
to the front and emits a `MISPLACED_DEFAULT_STATE` dev warning — previously it
silently overrode every state above it because a `TRUE` condition is never
negated.

Defining both a `_` fallback floor and a bare `''` default with no other states
is redundant: the `''` default would always be superseded by the floor. Tasty
now keeps the `_` value, drops the `''` default, and emits a
`REDUNDANT_DEFAULT_STATE` dev warning. When other states exist, `_` and `''`
coexist (one is the always-on floor, the other the negated default).
