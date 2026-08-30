---
'@tenphi/tasty': minor
---

Add precompiled component catalogs with build-time CSS and manifest generation,
universal runtime registration, optional one-shot browser installation, and
browser/SSR/RSC chunk fast paths. Component dependency metadata now prevents
duplicate ancillary at-rules, anonymous keyframe and counter-style names are
content-addressed across environments, and normal SSR hydration can recognize
covered chunks before running the style pipeline.
