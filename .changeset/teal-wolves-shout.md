---
'@tenphi/tasty': patch
---

Fix `$: '> SubElementName'` selector affix syntax so that when the trailing element name matches the sub-element's own key it acts as a placeholder rather than triggering a duplicate key injection.
