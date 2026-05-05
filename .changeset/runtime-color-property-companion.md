---
'@tenphi/tasty': patch
---

Runtime injector now registers the decomposed-components companion `@property --{name}-color-{colorSpace}` for every color token, matching the SSR formatter. Previously, `injector.property('#name', …)` (and therefore `markStylesGenerated()` and `DEFAULT_PROPERTIES` like `#white`/`#black`/`#current`) only emitted the `--name-color` rule on the client, while SSR emitted both. Non-SSR consumers (Storybook, CSR apps) can now animate/transition the components variable just like in SSR.
