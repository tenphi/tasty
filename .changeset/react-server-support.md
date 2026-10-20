---
'@tenphi/tasty': patch
---

React Server Components fixes:

- **The main entry loads under the `react-server` condition.** React's server build has no `createContext`, `useContext` or `useInsertionEffect`, and named imports of them stopped `@tenphi/tasty` from loading in a plain Node process run with `--conditions react-server`.
- **`useStyles()` works in Server Components.** It skips the `TastyRegistry` context lookup there, and queues its CSS for the next `tasty()` element to emit, as the other style functions do.
- **Rendering on the server without a request scope now warns in development.** In React's standard build — Astro without `tastyIntegration()`, or a client component server-rendered without `TastyRegistry` — `React.cache` does not cache, so each `tasty()` element inlines all of its CSS, and configured globals (tokens, `@property` defaults, `globalStyles`, `@font-face`) and the CSS of the standalone style functions are not emitted. Tasty now says so once, and points to `tastyIntegration()`, `TastyRegistry` or `runWithCollector()`.
