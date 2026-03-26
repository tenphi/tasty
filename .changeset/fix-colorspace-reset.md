---
"@tenphi/tasty": patch
---

Fix `configure()` unconditionally resetting `colorSpace` to `'oklch'` on every call, even when `colorSpace` is not provided. Now `colorSpace` follows the same merge semantics as other config options — it is only changed when explicitly passed.
