---
'@tenphi/tasty': patch
---

Optimize @property auto-inference: skip non-custom-property declarations early, bypass token parsing indirection, remove color value detection and type mismatch validation overhead.
