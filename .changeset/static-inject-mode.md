---
'@tenphi/tasty': minor
---

Add `mode: 'inject'` option to the Babel plugin. In inject mode, CSS is embedded inline in JS and injected at runtime via a tiny injector (`@tenphi/tasty/static/inject`), making `tastyStatic` calls self-contained. Ideal for reusable components and extensions.
