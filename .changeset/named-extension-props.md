---
'@tenphi/tasty': minor
---

Export `TastyExtensionProps` and `ComponentStatics`, and type a `tasty(Component, …)` extension's props as `Partial` of its base's props. A library's declaration for an exported extension now names those props instead of listing each one, so it no longer needs every type they use to be exported. An extension of a base whose props are a union now accepts each member's props, not only the keys they share.
