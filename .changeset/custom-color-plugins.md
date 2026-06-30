---
'@tenphi/tasty': minor
---

Custom color functions now work as ordinary plugins with no core special-casing.

Previously `okhsl`/`okhst` were hardcoded across the style core (parser, `strToRgb`, `resolveToRgbaValues`, `#token.alpha` injection, and the fast-path color check), so a third-party color plugin could not achieve the same integration without editing Tasty itself.

The core now treats any custom `functions` entry whose output is an already-supported color (`rgb`, `hsl`, `#…`, `oklch`, …) as a first-class color value by delegating back to the parser. All okhsl/okhst special-casing has been removed; they are now ordinary one-liner plugins registered by default (backward compatible — zero-config usage is unchanged).

New public exports for plugin authors: `createColorFunc` (helper for HSL-style color spaces) and `resolveFunctionColor`. A third-party color plugin is now just:

```ts
const myPlugin = () => ({
  name: 'mycolor',
  functions: { mycolor: (groups) => 'rgb(...)' },
});
configure({ plugins: [myPlugin()] });
```

`createColorFunc`'s signature changed from `(name, channelLabel, convert)` to `(name, convert, label?)` — the label is now an optional trailing argument used only to format dev warnings.
