---
'@tenphi/tasty': minor
---

Support `theme` on sub-elements created by `elements`. As on the root component, it renders as `data-theme`, and an explicit `data-theme` wins over it. Before, a sub-element passed `theme` through as a raw DOM attribute, which states such as `@own(theme=dark)` don't match.
