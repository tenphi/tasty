---
'@tenphi/tasty': minor
---

Add props middleware and global base style props, and make custom style handlers unambiguous.

**`configure({ propHandlers })`** registers middleware over component props — props in, props out. It is the extension point for props that are *not* style properties: read a custom prop, strip it so it never reaches the DOM, and fold its meaning into `styles`, `mods`, `tokens`, `variant`, or `as`.

```ts
configure({
  propHandlers: {
    glaze: (props) => {
      const { glaze, ...rest } = props;
      if (!glaze) return rest;

      return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
    },
  },
});

<Element glaze="purple" />
```

The map key is the handler's name and, by default, the prop that triggers it — an absent prop costs one property check, not a call. Use `['*', fn]` for an unconditional handler or `[['a', 'b'], fn]` to trigger on any of several props. Handlers run in registration order (plugins first, then direct config), each receiving the previous one's output, and run before any prop is destructured, so a handler can rewrite every tasty prop. Returning nothing is treated as "unchanged" with a development-mode warning, since it is almost always a forgotten `return props`.

Handlers must be pure and must not mutate their input: style values are cached by object identity, so mutating one in place produces a stale class name and stale CSS. Memoize the styles you build per input value — this also lets the cache key reuse its serialization instead of recomputing it every render.

Not applicable to zero-runtime mode: `tastyStatic()` takes styles objects, not props, so there is nothing for middleware to run on. Components rendered through `tasty()` are unaffected and get their CSS from the runtime injector as usual. Server and client must register the same handlers, or class names diverge and hydration mismatches — the same requirement as `namePrefix`.

**`configure({ baseStyleProps })`** exposes style properties as top-level props on **every** tasty component, without each component listing them in `styleProps`:

```ts
configure({ baseStyleProps: ['radius', 'shadow'] });

<Card radius="1r" shadow />
```

Base style props are now resolved lazily per component and refreshed when the registry changes, so `configure()` may run *after* your components are defined — previously the prop list was fixed when each `tasty()` factory was created, which happens at module load.

Type both with module augmentation: `TastyCustomProps` for `propHandlers` keys, and `TastyBaseStylePropNames` (each name set to `true`) for promoted style names, which are then typed exactly like the style they name. Both plugins and `configure()` can supply `propHandlers` and `baseStyleProps`.

**Plugins can now also supply `properties`, `keyframes`, `fontFaces`, and `counterStyles`.** A plugin whose handler or prop handler emits a custom property usually needs an `@property` declaration alongside it, which previously could only come from `configure()` directly. All four merge with the `configure()` values, with direct config winning on conflict.

**Custom style handlers are safer and better typed.**

- A handler whose dependencies mix known and unknown style names now has the unknown ones assigned to the same chunk, so it is invoked **once with all of its dependencies** instead of once per chunk with a subset. Chunks are cached independently on their own style values, so the old behaviour could emit stale CSS. A handler that bridges two *built-in* chunks warns instead, since fixing that would mean re-chunking built-in styles.
- Replacing a built-in handler now warns in development and lists what it displaced. Built-in handlers are shared across style names, so `configure({ handlers: { fill } })` also took over `image` and the whole `background-*` family, and `configure({ handlers: { display } })` took down `flow`, `gap`, `hide`, `overflow`, `whiteSpace`, and `textOverflow` — and the displaced names did not go dark, they silently fell back to auto-generated CSS aliases, so `hide: true` began emitting a literal `hide: true` declaration.
- New `defineHandler(deps, fn)` infers each dependency's type from the dependency list, so a typo in the destructure is a type error rather than a silent `undefined`.
- New `StyleHandlerProps`, `ResolvedStyleValue`, and `AnyStyleHandler` types. `RawStyleHandler` and `StyleHandler` take an optional props type parameter, and the handler dependency map is now typed as the resolved scalars handlers actually receive rather than a state map — which removes the blanket `@ts-expect-error` the built-in registry needed.
- `CSSMap` accepts the numeric values built-in handlers already returned (`{ '-webkit-line-clamp': 3 }`), and a handler that returns a camelCase CSS property name now emits a `HANDLER_CAMEL_CASE_KEY` warning in development instead of silently producing a declaration the browser ignores. `--custom-property` names are exempt, being case-sensitive.

`docs/configuration.md` now documents the handler return shape, the `$` selector-suffix key, that values arrive as raw unparsed DSL strings, the shared-handler groups, and chunk membership.
