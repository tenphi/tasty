---
'@tenphi/tasty': patch
---

Skip OR expansion for pure-selector ORs so same-context branches like `:hover | :focus` or `:-webkit-autofill | :autofill` collapse cleanly into `:is(...)` instead of producing dead `:not()` chains. Also warn (dev only) when a state key references unmatchable `:-internal-*` pseudo-classes.
