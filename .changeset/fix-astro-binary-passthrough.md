---
'@tenphi/tasty': patch
---

Fix Astro SSR middleware corrupting binary responses. The middleware
previously decoded every response body as UTF-8 text, mangling non-HTML
payloads (images, fonts, JSON, etc.) — e.g. PNG bytes served from an OG
image endpoint. It now inspects the `Content-Type` and passes any
response that isn't `text/html` (or has no body) through untouched.
