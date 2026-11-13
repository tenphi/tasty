---
'@tenphi/tasty': patch
---

`tasty:styles` renders with the copy of Tasty that its `--setup` modules configure, so in a monorepo, or next to a UI library with its own Tasty, the CSS matches what the package runs. It resolves package paths in `--setup` from the current folder, warns when the setup modules configure two copies of Tasty and names both versions, and warns about a setup module that changes no config.
