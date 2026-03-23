# Runtime API

The React-specific `tasty()` component factory, component props, and hooks. For the shared style language (state maps, tokens, units, extending semantics), see [Style DSL](dsl.md). For global configuration, see [Configuration](configuration.md). For the broader docs map, see the [Docs Hub](README.md).

---

## Component Creation

### Create a new component

```jsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  as: 'div',
  styles: {
    padding: '4x',
    fill: '#white',
    border: true,
    radius: true,
  },
  styleProps: ['padding', 'fill'],
});

<Card>Hello World</Card>
<Card padding="6x" fill="#gray.05">Custom Card</Card>
```

### Extend an existing component

```jsx
const PrimaryButton = tasty(Button, {
  styles: {
    fill: '#purple',
    color: '#white',
    padding: '2x 4x',
  },
});
```

Style maps merge intelligently — see [Style DSL — Extending vs. Replacing State Maps](dsl.md#extending-vs-replacing-state-maps) for extend mode, replace mode, `@inherit`, `null`, and `false` tombstones.

---

## Style Props

Use `styleProps` to expose style properties as direct component props:

```jsx
const FlexibleBox = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    padding: '2x',
  },
  styleProps: ['gap', 'align', 'placeContent', 'fill'],
});

<FlexibleBox gap="2x" align="center" fill="#surface">
  Content
</FlexibleBox>
```

Style props accept state maps, so responsive values work through the same API:

```jsx
<FlexibleBox
  gap={{ '': '2x', '@tablet': '4x' }}
  fill={{ '': '#surface', '@dark': '#surface-dark' }}
>
```

For predefined style prop lists (`FLOW_STYLES`, `POSITION_STYLES`, `DIMENSION_STYLES`, etc.) and guidance on which props to expose per component category, see [Methodology — styleProps as the public API](methodology.md#styleprops-as-the-public-api).

---

## Variants

Define named style variations. Only CSS for variants actually used at runtime is injected:

```jsx
const Button = tasty({
  styles: {
    padding: '2x 4x',
    border: true,
  },
  variants: {
    default: { fill: '#blue', color: '#white' },
    danger: { fill: '#red', color: '#white' },
    outline: { fill: 'transparent', color: '#blue', border: '1bw solid #blue' },
  },
});

<Button variant="danger">Delete</Button>
```

### Extending Variants with Base State Maps

When base `styles` contain an extend-mode state map (an object **without** a `''` key), it is applied **after** the variant merge. This lets you add or override states across all variants without repeating yourself:

```jsx
const Badge = tasty({
  styles: {
    padding: '1x 2x',
    border: {
      'type=primary': '#clear',
    },
  },
  variants: {
    primary: {
      border: { '': '#white.2', pressed: '#primary-text', disabled: '#clear' },
      fill: { '': '#white #primary', hovered: '#white #primary-text' },
    },
    secondary: {
      border: { '': '#primary.15', pressed: '#primary.3' },
      fill: '#primary.10',
    },
  },
});

// Both variants get 'type=primary': '#clear' appended to their border map
```

Properties that are **not** extend-mode (simple values, state maps with `''`, `null`, `false`, selectors, sub-elements) merge with variants as before — the variant can fully replace them.

---

## Sub-element Styling

Sub-elements are inner parts of a compound component, styled via capitalized keys in `styles` and identified by `data-element` attributes in the DOM.

> Use the `elements` prop to declare sub-element components. This gives you typed, reusable sub-components (`Card.Title`, `Card.Content`) instead of manually writing `data-element` attributes.

```jsx
const Card = tasty({
  styles: {
    padding: '4x',
    Title: { preset: 'h3', color: '#primary' },
    Content: { color: '#text' },
  },
  elements: {
    Title: 'h3',
    Content: 'div',
  },
});

<Card>
  <Card.Title>Card Title</Card.Title>
  <Card.Content>Card content</Card.Content>
</Card>
```

Each entry in `elements` can be a tag name string or a config object:

```jsx
elements: {
  Title: 'h3',                          // shorthand: tag name only
  Icon: { as: 'span', qa: 'card-icon' }, // full form: tag + QA attribute
}
```

The sub-components produced by `elements` support `mods`, `tokens`, `isDisabled`, `isHidden`, and `isChecked` props — the same modifier interface as the root component.

If you don't need sub-components (e.g., the inner elements are already rendered by a third-party library), you can still style them by key alone — just omit `elements` and apply `data-element` manually:

```jsx
const Card = tasty({
  styles: {
    padding: '4x',
    Title: { preset: 'h3', color: '#primary' },
  },
});

<Card>
  <div data-element="Title">Card Title</div>
</Card>
```

### Selector Affix (`$`)

Control how a sub-element selector attaches to the root selector using the `$` property inside the sub-element's styles:

| Pattern | Result | Description |
|---------|--------|-------------|
| *(none)* | ` [el]` | Descendant (default) |
| `>` | `> [el]` | Direct child |
| `>Body>Row>` | `> [Body] > [Row] > [el]` | Chained elements |
| `::before` | `::before` | Root pseudo (no key) |
| `@::before` | `[el]::before` | Pseudo on the sub-element |
| `>@:hover` | `> [el]:hover` | Pseudo-class on the sub-element |
| `>@.active` | `> [el].active` | Class on the sub-element |

The `@` placeholder marks exactly where the `[data-element="..."]` selector is injected, allowing you to attach pseudo-classes, pseudo-elements, or class selectors directly to the sub-element instead of the root:

```jsx
const List = tasty({
  styles: {
    Item: {
      $: '>@:last-child',
      border: 'none',
    },
  },
});
// → .t0 > [data-element="Item"]:last-child { border: none }
```

For the mental model behind sub-elements — how they share root state context and how this differs from BEM — see [Methodology — Component architecture](methodology.md#component-architecture-root--sub-elements).

---

## Hooks

### useStyles

Generate a className from a style object:

```tsx
import { useStyles } from '@tenphi/tasty';

function MyComponent() {
  const { className } = useStyles({
    padding: '2x',
    fill: '#surface',
    radius: '1r',
  });

  return <div className={className}>Styled content</div>;
}
```

### useGlobalStyles

Inject global styles for a CSS selector:

```tsx
import { useGlobalStyles } from '@tenphi/tasty';

function ThemeStyles() {
  useGlobalStyles('.card', {
    padding: '4x',
    fill: '#surface',
    radius: '1r',
  });

  return null;
}
```

### useRawCSS

Inject raw CSS strings:

```tsx
import { useRawCSS } from '@tenphi/tasty';

function GlobalReset() {
  useRawCSS(`
    body { margin: 0; padding: 0; }
  `);

  return null;
}
```

### useKeyframes

Inject `@keyframes` rules and return the generated animation name:

```tsx
import { useKeyframes } from '@tenphi/tasty';

function Spinner() {
  const spin = useKeyframes(
    {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
    { name: 'spin' }
  );

  return <div style={{ animation: `${spin} 1s linear infinite` }} />;
}
```

`useKeyframes()` also supports a factory function with dependencies:

```tsx
function Pulse({ scale }: { scale: number }) {
  const pulse = useKeyframes(
    () => ({
      '0%': { transform: 'scale(1)' },
      '100%': { transform: `scale(${scale})` },
    }),
    [scale]
  );

  return <div style={{ animation: `${pulse} 500ms ease-in-out alternate infinite` }} />;
}
```

### useProperty

Register a CSS `@property` rule so a custom property can animate smoothly:

```tsx
import { useProperty } from '@tenphi/tasty';

function Spinner() {
  useProperty('$rotation', {
    syntax: '<angle>',
    inherits: false,
    initialValue: '0deg',
  });

  return <div style={{ transform: 'rotate(var(--rotation))' }} />;
}
```

`useProperty()` accepts Tasty token syntax for the property name:

- `$name` defines `--name`
- `#name` defines `--name-color` and auto-infers `<color>`
- `--name` is also supported for existing CSS variables

### Troubleshooting

- Styles are not updating: make sure `configure()` runs before first render, and verify the generated class name or global rule with [Debug Utilities](debug.md).
- SSR output looks wrong: check the [SSR guide](ssr.md) because the hooks integrate with SSR collectors differently than the client-only runtime path.
- Animation/custom property issues: prefer `useKeyframes()` and `useProperty()` over raw CSS when you want Tasty to manage injection and SSR collection for you.

---

## Learn more

- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[Methodology](methodology.md)** — Recommended patterns: root + sub-elements, styleProps, tokens, wrapping
- **[Configuration](configuration.md)** — Tokens, recipes, custom units, style handlers, TypeScript extensions
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
- **[Zero Runtime (tastyStatic)](tasty-static.md)** — Build-time static styling with Babel plugin
- **[Server-Side Rendering](ssr.md)** — SSR setup for Next.js, Astro, and generic frameworks
- **[Debug Utilities](debug.md)** — Inspect injected CSS, cache state, and active styles at runtime
