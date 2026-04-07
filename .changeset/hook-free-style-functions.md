---
'@tenphi/tasty': minor
---

Make all style functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`) hook-free and compatible with React Server Components. Add RSC inline support via shared per-request cache. Add `id` option to `useRawCSS` and `useGlobalStyles` for update tracking.

**Breaking behavior change:** `useGlobalStyles` and `useRawCSS` no longer clean up injected styles on component unmount. Styles are now permanent once injected. For dynamic styles that change over the component lifecycle, use the `id` option to enable update tracking — when styles change for the same `id`, the previous injection is replaced.
