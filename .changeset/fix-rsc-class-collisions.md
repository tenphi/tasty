---
'@tenphi/tasty': patch
---

Fix CSS class name collisions during client-side navigation in Next.js App Router. RSC inline styles used sequential counters (`r0`, `r1`, …) that reset on every request, causing different pages to generate identical class names with different CSS. Replace sequential counters with content-based hashing (djb2) for RSC class names, keyframes, and counter-styles so identical content always maps to the same name across requests.
