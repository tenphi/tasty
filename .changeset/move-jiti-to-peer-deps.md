---
'@tenphi/tasty': patch
---

Move `jiti` from `dependencies` to optional `peerDependencies` since it is only needed by the Next.js zero-runtime wrapper (`@tenphi/tasty/next`). Document requirements for SSR and zero-runtime entry points.
