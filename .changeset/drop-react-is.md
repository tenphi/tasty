---
'@tenphi/tasty': patch
---

Drop `react-is` dependency by replacing `isValidElementType` with a lightweight internal utility. Move `@babel/helper-plugin-utils` and `@babel/types` from dependencies to optional peer dependencies since they are only needed for the Babel plugin entry point.
