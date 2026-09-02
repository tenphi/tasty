---
'@tenphi/tasty': patch
---

Fix `tastyDebug` throwing in environments without a DOM. Every reader took
`document` as a default parameter value, which is evaluated per call, so
`css`, `inspect`, `summary`, `chunks` and `cache` raised
`ReferenceError: document is not defined` on a server, in a Node REPL, or in a
test runner's `node` environment. They now return their empty result and
explain themselves once with a console warning, which `{ raw: true }`
suppresses along with the rest of the logging.
