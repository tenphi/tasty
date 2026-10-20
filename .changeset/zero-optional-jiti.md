---
'@tenphi/tasty': patch
---

The Babel plugin (`@tenphi/tasty/babel-plugin`) and the Next.js wrappers (`@tenphi/tasty/zero/next`, `@tenphi/tasty/ssr/next-config`) no longer import the optional `jiti` peer up front. It is loaded only when `configFile` is used, so a project that passes `config` directly no longer needs `jiti` installed. Without it, `configFile` fails with an error that says to install it.
