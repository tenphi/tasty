---
'@tenphi/tasty': minor
---

Overhaul style handler system with CSS-wide keyword support, directional factory, unified placement, and new scrollMargin style.

- All style handlers now accept CSS-wide keywords (`initial`, `inherit`, `revert`, `unset`, `revert-layer`) where semantically valid
- New `scrollMargin` style with full directional, block/inline, and priority support
- Unified `placementStyle` handler replaces separate `align`, `justify`, and `place` with hierarchical priority (longhands override shorthands)
- Shared directional factory eliminates code duplication across `padding`, `margin`, `inset`, and `scrollMargin`
- Standardized handler return types to `null` for no-output
- Fixed `preset` fontStyle handling for non-inherit CSS-wide keywords
