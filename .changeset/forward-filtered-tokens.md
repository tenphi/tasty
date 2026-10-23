---
'@tenphi/tasty': patch
---

Preserve `tokens`, `theme`, and `isChecked` in `filterBaseProps`, so it keeps every `BaseProps` prop except `styles`. A component that wraps a Tasty element with the helper no longer drops a consumer's `tokens` silently; `theme` now reaches the element as `data-theme`, and `isChecked` as `checked` and `data-checked`. A wrapper that sets one of these before spreading the filtered props now has it replaced by the consumer's value, as `style` already is; set it after the spread, or merge the `tokens` objects, to keep it.
