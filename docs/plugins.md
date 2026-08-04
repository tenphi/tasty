# Plugins & Extension Points

How to extend Tasty: new value syntax, new units, new states, new style properties, new component props, and how to package any of it as a plugin.

- [What a plugin is](#what-a-plugin-is)
- [Choosing an extension point](#choosing-an-extension-point)
- [Custom style handlers](#custom-style-handlers)
- [Props middleware](#props-middleware)
- [Base style props](#base-style-props)
- [Typing your extension](#typing-your-extension)
- [Worked example: a `glaze` plugin](#worked-example-a-glaze-plugin)
- [Rendering modes and caveats](#rendering-modes-and-caveats)
- [Testing a plugin](#testing-a-plugin)

---

## What a plugin is

A plugin is a plain object with a `name` and any subset of the `configure()` options it is allowed to supply. There is no lifecycle and no init hook — a plugin is just pre-packaged configuration.

```ts
import { configure } from '@tenphi/tasty';
import type { TastyPluginFactory } from '@tenphi/tasty';

const spacingPlugin: TastyPluginFactory = () => ({
  name: 'spacing',
  units: { gu: (n) => `calc(${n} * var(--grid-unit))` },
  tokens: { '$grid-unit': '4px' },
});

configure({ plugins: [spacingPlugin()] });
```

`TastyPluginFactory<TOptions>` types a factory that takes options; with no type argument it types a zero-argument factory.

**Ordering.** Plugins are applied in array order and merged key by key, so a later plugin overrides an earlier one for the same key. Options passed directly to `configure()` are applied last and win over every plugin.

**Configuration is locked after the first render.** `configure()` warns and does nothing once any style has been generated, so it must run before your first component renders — at module scope in your entry file, or in a design-system module every component imports. `resetConfig()` reopens it, but it exists for tests.

**Repeated `configure()` calls merge** for `tokens` and `globalStyles` (per selector). See [Configuration](configuration.md) for the current per-key semantics.

---

## Choosing an extension point

| You want to add | Use | Runs | Zero-runtime |
|---|---|---|---|
| New value syntax — `okhsl(…)`, `double(2x)` | `functions` (bare key) | parse time, per value | ✅ |
| A reusable CSS `@function` | `functions` (`$$name` key) | injected once, globally | ✅ |
| A new unit — `2gu` | `units` | parse time, per value | ✅ |
| A new state alias — `@mobile` | `states` | state-key parse | ✅ |
| A style property → **CSS declarations** | `handlers` | pipeline, per state snapshot | ✅ |
| A style property on every component | `baseStyleProps` | prop harvest | ✅ (styles only) |
| A **component prop** → anything | `propHandlers` | render, per component | ❌ (no props to run on) |
| A named bundle of styles | `recipes` | before chunking | ✅ |
| Typography scale tokens | `presets` | inject time | ✅ |
| `:root` variables | `tokens`, `replaceTokens` | inject time | ✅ |
| Global selector styles | `globalStyles` | inject time | ✅ |

Two distinctions do most of the work:

- **`handlers` vs `propHandlers`.** A handler turns a *style property* into CSS declarations and knows nothing about components. A prop handler turns a *component prop* into other props — including `styles`, which then flow through the normal handlers. Reach for `propHandlers` when the input isn't a style value (an options object, a domain concept) or when it should affect more than styles.
- **`recipes` vs `propHandlers`.** A recipe is a static named bundle. A prop handler computes its styles from a value.

---

## Custom style handlers

A handler receives a map of the style properties it declared and returns CSS declarations. See [Configuration → Custom Style Handlers](configuration.md#custom-style-handlers) for the definition forms, return shape, the shared-handler groups you must be careful of, and chunk membership. The essentials:

- Values arrive **state-resolved but unparsed** — the raw authored DSL string (`'2x'`, `'#purple.5'`, `true`, `4`). Call the exported `parseStyle()` / `parseColor()` yourself.
- Return a `CSSMap` with **kebab-case** keys, an array of them, or nothing. `$` is a selector suffix, not a property.
- Handlers must be pure and synchronous. They are called once per state combination and the results are cached.
- Use `defineHandler(deps, fn)` for multi-dependency handlers so the dependency types are inferred.

```ts
import { configure, defineHandler, parseStyle } from '@tenphi/tasty';

configure({
  handlers: {
    // Every declaration set the handler returns can target its own selector.
    stripe: defineHandler(['stripe'], ({ stripe }) => {
      if (!stripe) return;

      const { values } = parseStyle(String(stripe)).groups[0];

      return [
        { position: 'relative' },
        {
          $: '&::before',
          content: '""',
          position: 'absolute',
          inset: '0 auto 0 0',
          width: values[0],
          background: 'var(--purple-color)',
        },
      ];
    }),
  },
});
```

---

## Props middleware

`propHandlers` are middleware over a component's props: props in, props out. They run at the very top of every tasty component's render, before any prop is destructured, so a handler can read and rewrite `styles`, `mods`, `tokens`, `variant`, `as`, `element`, and `qa`, and can strip its own props so they never reach the DOM.

```ts
import { configure, mergeStyles } from '@tenphi/tasty';

configure({
  propHandlers: {
    glaze: (props) => {
      const { glaze, ...rest } = props;
      if (!glaze) return rest;

      return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
    },
  },
});
```

**The key is the trigger.** By default a handler runs only when a prop matching its key is present, so an absent prop costs one property check rather than a call. Override that with a tuple:

| Definition | Runs when |
|---|---|
| `fn` | a prop named after the key is present |
| `['glaze', fn]` | `glaze` is present |
| `[['glaze', 'tint'], fn]` | either is present |
| `['*', fn]` | always |

**Chaining.** Handlers run in registration order — plugins first, then direct `configure()` — and each receives the previous one's output. Registering the same key twice replaces the handler in place, keeping its position.

**Returning nothing means unchanged**, with a development-mode warning, because that is almost always a forgotten `return props`. A non-object return is ignored with a warning.

### Rules

- **Be pure. Never mutate the input.** Style values are cached by object identity, so mutating a value object in place yields a stale class name *and* stale CSS. Return fresh objects.
- **Memoize the styles you build, per input value.** A reference-stable (ideally frozen) styles object lets the cache key reuse its serialization instead of recomputing it on every render. This is the single highest-leverage thing you can do for performance.
- **Precedence is fixed** and not adjustable from a handler. Styles are merged as `factory defaults → styles → harvested style props`, and injected styles occupy the `styles` slot: they beat a component's own default styles and lose to a style prop passed at the call site. This matches how `recipe` already behaves.
- **Prefer returning `styles` over bare style props.** Returning `{ fill: '#red' }` only works if `fill` is harvestable on *that* component (in its `styleProps`, or promoted via `baseStyleProps`); otherwise it leaks to the DOM.

### What it cannot do

- **`ref`** — `forwardRef` separates it from props, so it is out of reach.
- **Sub-elements** (`Card.Title`) — they have no `styles` prop and no style-prop harvest, so middleware does not run on them.
- **Zero-runtime mode** — see [Rendering modes](#rendering-modes-and-caveats).

---

## Base style props

A small set of style properties — `display`, `font`, `preset`, `hide`, `whiteSpace`, `opacity`, `transition` — are harvested as props on every `tasty()` component. `baseStyleProps` adds to that set globally:

```ts
configure({ baseStyleProps: ['radius', 'shadow'] });

<Card radius="1r" shadow />
```

Names must be real style properties, must start with a lowercase letter, and must not collide with a prop `tasty()` consumes itself (`as`, `styles`, `variant`, `mods`, `tokens`, …); invalid entries are dropped with a development warning.

`configure()` may run *after* your components are defined — each factory resolves its prop list lazily and refreshes when the registry changes.

**Costs and caveats.** Each name adds one property check per render of every component, forever, so keep the list short. The effect is app-global and cannot be scoped to a subtree — use a factory's own `styleProps` for that. Be wary of names that collide with real DOM or component props (`width`, `size`, `color`): promoting one means every component swallows it as a style, including when rendering `as={SomeThirdPartyComponent}`.

---

## Typing your extension

Four augmentation points, each matching a runtime registry:

```ts
// tasty.d.ts
import type { StylePropValue } from '@tenphi/tasty';

declare module '@tenphi/tasty' {
  // configure({ handlers }) — a new style property
  interface StylesInterface {
    stripe?: StylePropValue<string>;
  }

  // configure({ propHandlers }) — a new component prop
  interface TastyCustomProps {
    glaze: 'soft' | 'strong' | { tone: string; intensity?: number };
  }

  // configure({ baseStyleProps }) — promoted style names, typed like the style
  interface TastyBaseStylePropNames {
    radius: true;
    shadow: true;
  }

  // configure({ tokens }) / recipes / presets — autocomplete for names
  interface TastyNamedColors {
    'glaze-bg': true;
  }
}
```

`TastyCustomProps` keys become optional props on every component. `TastyBaseStylePropNames` entries are typed exactly like the style they name, so `radius="1r"` accepts the same values as `styles={{ radius: '1r' }}`.

**Also update `tasty.config.ts`.** The ESLint plugin and VS Code extension validate style and token names against it, and neither is derived from the runtime registries:

```ts
// tasty.config.ts
export default {
  styles: ['stripe'],
  tokens: ['#glaze-bg'],
};
```

`propHandlers` keys are JSX props rather than style keys, so they need no entry — but any *style* name or token a handler expands into does.

---

## Worked example: a `glaze` plugin

A `glaze` prop on every component that takes a configuration object and expands into color token declarations. This is the case `propHandlers` exists for: the value is an options object, not a style value, so it cannot be a style property.

```ts
// glaze-plugin.ts
import { mergeStyles } from '@tenphi/tasty';
import type { Styles, TastyPluginFactory } from '@tenphi/tasty';

export interface GlazeConfig {
  tone: string;
  /** 0–100. Default 10. */
  intensity?: number;
}

type GlazeValue = string | GlazeConfig;

// Memoized per value so the styles object is reference-stable across renders.
const cache = new Map<string, Styles>();

function glazeStyles(value: GlazeValue): Styles {
  const { tone, intensity = 10 } =
    typeof value === 'string' ? { tone: value } : value;
  const key = `${tone}:${intensity}`;

  let styles = cache.get(key);

  if (!styles) {
    styles = Object.freeze({
      '#glaze-bg': `#${tone}.${intensity}`,
      fill: '#glaze-bg',
      transition: 'fill 0.2s',
    }) as Styles;
    cache.set(key, styles);
  }

  return styles;
}

export const glazePlugin: TastyPluginFactory = () => ({
  name: 'glaze',

  propHandlers: {
    glaze: (props) => {
      const { glaze, ...rest } = props;
      if (!glaze) return rest;

      return {
        ...rest,
        styles: mergeStyles(
          glazeStyles(glaze as GlazeValue),
          rest.styles as Styles,
        ),
      };
    },
  },

  // Typed so `#glaze-bg` animates smoothly instead of snapping.
  properties: {
    '#glaze-bg': { syntax: '<color>', inherits: false, initialValue: 'transparent' },
  },
});
```

```ts
// app entry, before the first render
import { configure } from '@tenphi/tasty';

import { glazePlugin } from './glaze-plugin';

configure({ plugins: [glazePlugin()] });
```

```tsx
<Element glaze="purple" />
<Element glaze={{ tone: 'success', intensity: 30 }} />
```

```ts
// tasty.d.ts
declare module '@tenphi/tasty' {
  interface TastyCustomProps {
    glaze: import('./glaze-plugin').GlazeConfig | string;
  }
}
```

The object value is unambiguous here precisely because `glaze` is a **prop**. A style *value* of the same shape would be indistinguishable from a state map (`{ tone: … }` looks exactly like `{ hovered: … }`), which is why this belongs in `propHandlers` rather than `handlers`.

---

## Rendering modes and caveats

| Mode | `functions` / `units` / `states` / `handlers` / `recipes` / `tokens` | `propHandlers` |
|---|---|---|
| Client | ✅ | ✅ |
| SSR / RSC | ✅ | ✅ |
| Zero-runtime (`tastyStatic`) | ✅ at build time | not applicable |

**Zero-runtime.** The Babel plugin transforms `tastyStatic()` calls, which take styles objects — there are no props in that pipeline, so there is nothing for props middleware to run on. Components you render through `tasty()` are untouched by the plugin and keep the runtime injector, so `propHandlers` work there exactly as in any client app; their CSS simply comes from the injector rather than the extracted stylesheet. Everything else runs at build time, which is why handlers, functions, and units must be pure functions of their input.

**Server and client must configure identically.** Class names are derived from resolved styles, so a handler or promoted prop registered on one side and not the other produces a hydration mismatch. This is the same requirement as `namePrefix` — see [SSR → Hydration mismatch warnings](ssr.md#hydration-mismatch-warnings).

---

## Testing a plugin

```ts
import { configure, resetConfig, renderStyles } from '@tenphi/tasty';

describe('glaze plugin', () => {
  beforeEach(() => resetConfig());
  afterEach(() => resetConfig());

  it('expands into a color token declaration', () => {
    configure({ plugins: [glazePlugin()] });

    const rules = renderStyles({ '#glaze-bg': '#purple.10' }, '.test');

    expect(rules[0].declarations).toContain('--glaze-bg-color');
  });
});
```

Two things to know:

- **Create components inside each test.** `resetConfig()` does not clear the per-factory class-name cache or prop-list memo, so a module-scope component created in one test carries state into the next.
- **Dev-mode warnings may not fire.** `isDevEnv()` reports `false` for `NODE_ENV=test`. Warnings that check it lazily can be enabled with `vi.stubEnv('NODE_ENV', 'development')`; some older ones capture it at module load and cannot be triggered from a test at all.

---

See [Configuration](configuration.md) for every option in detail, [Style DSL](dsl.md) for the value syntax your extensions produce, and [React API](react-api.md) for `tasty()`, `styleProps`, `modProps`, and `tokenProps`.
