---
'@tenphi/tasty': minor
---

Record the configuration a precompiled catalog was compiled under, and disable the catalog when the host's configuration differs.

A chunk's lookup key hashes the style *source* (`gap: "1x"`), not the CSS it produced, so a host that redefines a unit, recipe, state, style handler or props middleware the catalog compiled against still hit every chunk — and was served CSS its own configuration would never generate, with no warning. `registerTastyPrecompiled()` validated `tastyVersion` and chunk metadata but nothing about configuration.

Manifests now carry a `compilationConfig` snapshot (`schemaVersion` 2) and are checked against the host's configuration on first lookup, which is the first point at which that configuration is final — registration is a side-effect import that normally runs before the host calls `configure()`. A mismatch warns with the differing entries and falls back to runtime generation.

The comparison is per entry, not a single hash, so adding names the catalog never compiled — the usual case for an application layered on a design system — keeps the catalog. Redefining or removing one it did compile against, or overriding a built-in style handler or props middleware, drops it. Function-valued entries are compared by presence and arity rather than by source, since a catalog is built from an unminified bundle and the runtime may be reading a minified one.
