---
'@tenphi/tasty': patch
---

Fix state maps losing key priority. A later key whose value equals the `''` default (e.g. `disabled` in `{ '': A, checked: B, 'invalid & checked': C, disabled: A }`) no longer gets folded into the default and outranked by earlier keys, and keys that together always apply (such as `hovered: X, '!hovered': X`) now block the keys below them instead of overlapping them. Components whose state maps differ only in key order no longer share one class and its styles.
