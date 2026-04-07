---
'@tenphi/tasty': patch
---

Fix Astro streaming middleware: strip Content-Length header after injection, propagate upstream errors instead of silently truncating, remove dead hydrateTastyCache re-export.
