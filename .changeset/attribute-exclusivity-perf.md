---
'@tenphi/tasty': patch
---

Fix exponential render time for large state maps that use bracket attribute selectors.

Style maps combining many mutually-exclusive attribute states (e.g. `[data-variant="processing"] & [data-theme="..."]` across many themes) could take several seconds to render because the engine could not tell that selectors on the same attribute with different values never overlap. Bracket attribute selectors now parse as structured modifiers, so the pipeline recognizes their mutual exclusivity and drops the unnecessary negations between non-overlapping states. The generated CSS is also more compact: each state produces a single clean compound selector, and catch-all/default entries collapse `OR` chains of negations into a single `:not(...)`.
