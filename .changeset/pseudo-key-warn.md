---
'@tenphi/tasty': patch
---

Warn and ignore top-level style keys that start with `:` (e.g. `':hover'`, `'::before'`). Tasty's DSL puts pseudo-states in value maps or under nested-selector keys with an `&` prefix (`'&:hover'`); without `&` such keys previously fell through to a generic style handler and produced malformed CSS. The dev-mode warning explains the supported alternatives and the key is now dropped. Also restores the runtime `[tasty] Browser rejected CSS rule` dev warning, which was inadvertently silenced and is useful for catching exactly this kind of bug in real browsers.
