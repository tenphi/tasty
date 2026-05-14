---
'@tenphi/tasty': patch
---

Stop re-attempting (and re-warning about) `@property` injections in engines that don't support them (e.g. jsdom, happy-dom). Failed `@property` attempts are now cached per registry so each property name is tried at most once, and the `[tasty] Browser rejected CSS rule:` dev warning is suppressed for `@property` only when a one-shot per-registry feature probe confirms the engine lacks `@property` support. Warnings still fire for genuinely invalid `@property` definitions in engines that do support the feature.
