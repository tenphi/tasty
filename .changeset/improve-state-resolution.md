---
'@tenphi/tasty': patch
---

Improve state resolution logic for better handling of root and parent conditions. The `@dark` state now correctly distinguishes between cases where the schema attribute is not set versus when it's explicitly set to a non-dark value, ensuring proper CSS generation for all scenarios.