---
'@tenphi/tasty': patch
---

Fix Astro SSR middleware by buffering the response body so styles are collected when HTML is streamed. Improve parsing of nested parentheses in `@supports`, `@root`, `@parent`, `@own`, and `@(...)` state keys.
