---
'@tenphi/tasty': patch
---

Mirror global config (tokens, font-face, counter-style, properties) to globalThis so SSR collectors in separate module graphs (e.g. Astro middleware) can read it.
