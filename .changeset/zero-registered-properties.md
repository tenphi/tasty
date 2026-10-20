---
'@tenphi/tasty': patch
---

The Babel plugin now emits the `@property` rules the runtime registers: Tasty's defaults (`#white`, `#black`, `#clear`, `#border`, `$gap`, `$radius`, `$border-width`, `$outline-width`, …) and `config.properties`, which previously type-checked but was ignored. Static CSS that reads `var(--white-color)` or `var(--radius)` no longer depends on the token being configured. In file mode the rules are written once at the top of the output; in inject mode they are injected once per file that calls `tastyStatic()`. Automatic `@property` inference leaves these properties alone, so the declared definition is the one that applies.
