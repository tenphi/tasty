---
'@tenphi/tasty': patch
---

Type `fade` as accepting `true`, and document it.

`fade: true` already worked — an empty value list falls back to `calc(2 * var(--gap))`, a default that follows the gap token and which no explicit value can express (`fade: '2x'` bakes in a static `16px`). But the prop type was `string` only, `docs/ai-agents.md` listed `fade` among the properties that reject `true`, and the ESLint plugin flagged it. Three of the four sources disagreed with the implementation.

Surfaced by `@cube-dev/ui-kit`, whose `FadeAllDirections` story relies on it.
