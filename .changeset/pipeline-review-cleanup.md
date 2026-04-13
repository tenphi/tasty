---
'@tenphi/tasty': patch
---

Internal pipeline cleanup: refactor `processStyles` into named per-stage helpers, split `materialize.ts` (types + contradiction detection extracted to `materialize-types.ts` and `materialize-contradictions.ts`), document the actual stage flow in `docs/pipeline.md` and the `index.ts` header (Stage 0 normalization, user-OR vs De Morgan-OR expansion, consensus rule, `@starting-style` cascade ordering), and add tests for container style query rendering, explicit boolean-algebra laws, multi-variable consensus, De Morgan with mixed `@supports`/`@container`, empty-styles, and a known simplification gap for conflicting `@root(schema=…)` attribute values. No behavior change.
