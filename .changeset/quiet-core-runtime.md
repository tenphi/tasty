---
'@tenphi/tasty': patch
---

Keep the core entry from loading the component and hooks chunk by grouping its
hook-free style computation and prop helpers with the existing runtime engine.
