# Configuration

Configure the Tasty style system before your app renders using the `configure()` function. Configuration must be done **before any styles are generated** (before first render).

```jsx
import { configure } from '@tenphi/tasty';

configure({
  // CSP nonce for style elements
  nonce: 'abc123',

  // Global state aliases
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(768px <= w < 1024px)',
    '@dark': '@root(theme=dark)',
  },

  // Parser configuration
  parserCacheSize: 2000, // LRU cache size (default: 1000)

  // Custom units (merged with built-in units)
  units: {
    vh: 'vh',
    vw: 'vw',
    custom: (n) => `${n * 10}px`, // Function-based unit
  },

  // Custom functions for the parser
  funcs: {
    double: (groups) => {
      const value = parseFloat(groups[0]?.output || '0');
      return `${value * 2}px`;
    },
  },
});
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nonce` | `string` | - | CSP nonce for style elements |
| `states` | `Record<string, string>` | - | Global state aliases for advanced state mapping |
| `parserCacheSize` | `number` | `1000` | Parser LRU cache size |
| `units` | `Record<string, string \| Function>` | Built-in | Custom units (merged with built-in). See [built-in units](usage.md#built-in-units) |
| `funcs` | `Record<string, Function>` | - | Custom parser functions (merged with existing) |
| `handlers` | `Record<string, StyleHandlerDefinition>` | Built-in | Custom style handlers (replace built-in) |
| `tokens` | `Record<string, string \| number>` | - | Predefined tokens replaced during parsing |
| `keyframes` | `Record<string, KeyframesSteps>` | - | Global keyframes for animations |
| `properties` | `Record<string, PropertyDefinition>` | - | Global CSS @property definitions |
| `autoPropertyTypes` | `boolean` | `true` | Auto-infer and register `@property` types from values |
| `recipes` | `Record<string, RecipeStyles>` | - | Predefined style recipes (named style bundles) |

---

## Predefined Tokens

Predefined tokens are **replaced with their literal values at parse time** — they are baked into the generated CSS, not resolved via CSS custom properties at runtime. This makes them ideal for value aliases and shorthand references that should be inlined during style generation.

Use `$name` for value tokens and `#name` for color token aliases:

```jsx
configure({
  tokens: {
    $spacing: '2x',
    '$card-padding': '4x',
    '$button-height': '40px',
    '#accent': '#purple',
    '#surface-hover': '#gray.05',
  },
});
```

When a component uses `padding: '$card-padding'`, the parser replaces it with `'4x'` before generating CSS. When a component uses `fill: '#accent'`, it is replaced with `'#purple'`, which in turn resolves to `var(--purple-color)`.

> **Important:** Predefined tokens are for parse-time substitution. To define the actual CSS custom property values that color tokens and custom units resolve to at runtime (e.g. setting `--primary-color` or `--gap`), use `useGlobalStyles(':root', { '#primary': '...', '$gap': '8px' })`. See [Getting Started — Define design tokens and unit values](getting-started.md#define-design-tokens-and-unit-values) for the setup pattern.

Once defined, tokens can be used in any component's styles — see [Using Predefined Tokens](usage.md#predefined-tokens) in the usage guide.

---

## Recipes

Recipes are predefined, named style bundles. Define them globally via `configure()`:

```jsx
configure({
  recipes: {
    card: {
      padding: '4x',
      fill: '#surface',
      radius: '1r',
      border: true,
    },
    elevated: {
      shadow: '2x 2x 4x #shadow',
    },
  },
});
```

Recipe values are flat tasty styles (no sub-element keys). They may contain base styles, tokens, local states, `@keyframes`, and `@properties`. Recipes cannot reference other recipes.

For how to apply, compose, and override recipes in components, see [Using Recipes](usage.md#recipes) in the usage guide.

---

## Auto Property Types

CSS cannot transition or animate custom properties unless their type is declared via [`@property`](https://developer.mozilla.org/en-US/docs/Web/CSS/@property). Tasty handles this automatically — when a custom property is assigned a concrete value (e.g. `'$scale': 1`, `'$gap': '10px'`, `'#accent': 'purple'`), the type is inferred and a `@property` rule is registered.

This works across all declaration contexts: component styles, `@keyframes`, global config, and the zero-runtime Babel plugin. It also resolves `var()` chains — if `$a` references `var(--b)`, the type propagates once `--b` is resolved.

Supported types:

| Detection | Inferred syntax |
|-----------|-----------------|
| `1`, `0.5`, `-3` (bare numbers) | `<number>` |
| `10px`, `2rem`, `100vw` (length units) | `<length>` |
| `50%` | `<percentage>` |
| `45deg`, `0.5turn` (angle units) | `<angle>` |
| `300ms`, `1s` (time units) | `<time>` |
| `#name` tokens (by naming convention) | `<color>` |

Auto-inferred properties use `inherits: true` (the CSS default). Use explicit `@properties` when you need different settings:

```jsx
// In component styles
styles: {
  '@properties': {
    '$scale': { syntax: '<number>', inherits: false, initialValue: 1 },
  },
}

// Or globally
configure({
  properties: {
    '$scale': { syntax: '<number>', inherits: false, initialValue: 1 },
  },
});
```

To disable auto-inference entirely (only explicit `@properties` will be used):

```jsx
configure({ autoPropertyTypes: false });
```

---

## Custom Style Handlers

Override or extend the built-in style property handlers. A handler definition can take three forms:

| Form | Syntax | Description |
|------|--------|-------------|
| Function only | `handler` | Triggered by its key name; receives only that property |
| Single dep | `['styleName', handler]` | Triggered by the specified style property |
| Multi dep | `[['dep1', 'dep2', ...], handler]` | Triggered by any of the listed properties; receives all of them |

The multi-dep form is useful when output depends on several style properties together (e.g., `gap` needs to know `display` and `flow` to decide the CSS strategy).

```jsx
import { configure, styleHandlers } from '@tenphi/tasty';

configure({
  handlers: {
    // Function only — overrides built-in fill handler
    fill: ({ fill }) => {
      if (fill?.startsWith('gradient:')) {
        return { background: fill.slice(9) };
      }
      return styleHandlers.fill({ fill });
    },

    // Function only — new single-prop handler
    elevation: ({ elevation }) => {
      const level = parseInt(elevation) || 1;
      return {
        'box-shadow': `0 ${level * 2}px ${level * 4}px rgba(0,0,0,0.1)`,
        'z-index': String(level * 100),
      };
    },

    // Multi dep — handler reads multiple style properties
    gap: [['display', 'flow', 'gap'], ({ display, flow, gap }) => {
      if (!gap) return;
      const isGrid = display?.includes('grid');
      return { gap: isGrid ? gap : `/* custom logic for ${flow} */` };
    }],
  },
});
```

---

## Extending Style Types (TypeScript)

Use module augmentation to extend the `StylesInterface`:

```tsx
// tasty.d.ts
declare module '@tenphi/tasty' {
  interface StylesInterface {
    elevation?: string;
    gradient?: string;
  }
}
```

See [Usage Guide](usage.md) for component creation, state mappings, sub-elements, variants, and hooks.
