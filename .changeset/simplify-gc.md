---
'@tenphi/tasty': minor
---

Simplified the injector garbage collector to a touch-count-driven mechanism.

**Breaking changes to GC API:**

- Removed `maybeGC()` — GC is now auto-scheduled by touch count via `requestIdleCallback`
- Removed `gc()` options: `baseMaxAge`, `cacheCapacity` — replaced with `gc({ force?: boolean })`
- Replaced `GCConfig` fields (`auto`, `baseMaxAge`, `cooldown`, `autoInterval`, `cacheCapacity`) with `touchInterval` and `capacity`
- Removed `StyleUsage.hitCount` — only `lastTouchedAt` is tracked

**New behavior:**

- Every `touchInterval` touches (default: 1000), GC is scheduled via `requestIdleCallback`
- GC evicts the oldest unused styles when their count exceeds `capacity` (default: 1000); actively referenced styles don't count against the limit
- `gc({ force: true })` bypasses the capacity threshold and removes ALL unused styles
- No timers, no scoring math — activity-proportional triggering with oldest-first eviction
