---
'@tenphi/tasty': patch
---

Auto-inject generated CSS in zero-runtime mode

The Babel plugin now automatically replaces `@tenphi/tasty/static` imports with an import of the generated CSS file, eliminating the need to manually add `import '@/public/tasty.css'` in layout files. An empty CSS stub is created before the first build to avoid resolution errors on fresh clones. Controlled via the `injectImport` option (defaults to `true`).
