---
'@tenphi/tasty': minor
---

State aliases can reference other state aliases, e.g. `'@collapsed': '@mobile & !expanded'`. Previously such an alias was dropped with a warning. A local alias resolves against the component's aliases first, then global ones; a global alias resolves against global aliases only, so a local override never changes what it means. A circular alias never matches and emits a `CIRCULAR_STATE_ALIAS` warning instead of overflowing the stack.
