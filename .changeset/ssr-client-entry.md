---
'@tenphi/tasty': minor
---

Add `@tenphi/tasty/ssr/client`, a framework-neutral, browser-safe entry that exports `hydrateTastyClasses()` with no import side effects. Call it before `hydrateRoot()`.

`@tenphi/tasty/ssr` is also safe to import in a browser bundle now. It used to break rendering with "AsyncLocalStorage is not a constructor" once the bundler stubbed out `node:async_hooks`; the collector lookup now treats a stub as "no server collector", and `runWithCollector()` throws a clear error there instead.
