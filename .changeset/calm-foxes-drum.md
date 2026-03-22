---
'@tenphi/tasty': minor
---

Add configurable color space for decomposed color token companion variables (`configure({ colorSpace })`) with `oklch` as the new default.

**Breaking:** The default companion variable suffix changed from `-rgb` to `-oklch`. Any external CSS referencing `--name-color-rgb` variables directly will need to either:
- Set `configure({ colorSpace: 'rgb' })` to restore the previous behavior, or
- Update references to use `--name-color-oklch` instead.

Also unifies color conversion with shared OKHSL/sRGB math, improves OKHSL plugin and token handling, and updates related docs.
