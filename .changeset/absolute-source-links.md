---
'@tenphi/tasty': patch
---

Link source files and directories referenced by the shipped documentation to
GitHub. `src/` and `scripts/` are not published with the package, so the
relative links in `docs/pipeline.md` and `docs/runtime-benchmarks.md` were
broken for npm consumers and documentation sites built from the docs.
