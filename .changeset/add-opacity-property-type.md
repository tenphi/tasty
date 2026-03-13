---
'@tenphi/tasty': patch
---

Add name-based `--*-opacity` suffix rule to `autoPropertyTypes`: custom properties ending with `-opacity` are now automatically typed as `<number> | <percentage>` with initial value `0`, enabling smooth CSS transitions for opacity values.
