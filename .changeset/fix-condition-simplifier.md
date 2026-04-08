---
'@tenphi/tasty': patch
---

Fix overlapping and duplicate CSS selectors produced by the condition simplifier.

- Fix overlapping selectors when default and custom-state token values coincide but other state values differ.
- Fix overlapping selectors for compound state tokens by adding consensus resolution and making inner OR branches exclusive during CSS materialization.
- Fix complementary factoring for compound state conditions, eliminating duplicate selectors when token values match across state combinations.
- Eliminate duplicate token CSS rules when multiple states map to the same value. Tokens now generate a single rule instead of redundant duplicates. Also fixes absorption law so `A | (A & B)` correctly simplifies to `A` regardless of condition complexity.
