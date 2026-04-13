---
'@tenphi/tasty': patch
---

Fix missing state selectors when a non-default state maps to the same value as the default in a style map. Redundant compound state dimensions are now eliminated early in the pipeline.
