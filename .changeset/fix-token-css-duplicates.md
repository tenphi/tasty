---
'@tenphi/tasty': patch
---

Eliminate duplicate token CSS rules when multiple states map to the same value. Tokens like color tokens where `@dark` and `@dark & @high-contrast` produce identical values now generate a single `:root` rule instead of redundant duplicates. Also fixes absorption law for compound conditions so `A | (A & B)` correctly simplifies to `A` regardless of condition complexity.
