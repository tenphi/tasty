---
'@tenphi/tasty': patch
---

Fix `filterBaseProps` return types to exclude filtered-out props, allowing Tasty style props such as state-map `color` values to be safely filtered before spreading into native HTML elements or other components. Preserve explicitly allowed props and opt-in event handlers with their original value types.
