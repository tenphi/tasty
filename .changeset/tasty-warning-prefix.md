---
'@tenphi/tasty': patch
---

Standardize every console diagnostic on a single `[Tasty] ` prefix. Warnings
previously went out under six different conventions (`Tasty: `, `[tasty] `,
`tasty: `, `tastyDebug: `, `[Tasty] `, and no prefix at all), which made tasty
output impossible to filter reliably in a browser console. Non-fatal diagnostics
that were still firing in production — the `#current` color-token warning,
invalid custom style definitions, unparseable function tokens, ignored
`scrollbar="none"` tokens, and the default pipeline warning handler — are now
behind `process.env.NODE_ENV !== 'production'` so a bundler strips them from
production builds; `setWarningHandler` consumers still receive those warnings
programmatically in production. Real error reporting in the style-sheet manager
(rule insertion/deletion failures that swallow an exception, and a style element
failing to attach to the DOM) stays unconditional and just gains the prefix.
