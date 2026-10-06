---
'@tenphi/tasty': patch
---

Fix `tasty({ as: Component })` claiming unconfigured style prop names such as `position`, `color`, and `width` instead of preserving the component's declared prop types and requiredness. Explicitly exposed style props and always-available base style props retain their styling behavior.
