# Runtime API

The React-specific `tasty()` component factory, component props, and hooks. `tasty()` components are hook-free and compatible with React Server Components — no `'use client'` directive needed. For the shared style language (state maps, tokens, units, extending semantics), see [Style DSL](dsl.md). For global configuration, see [Configuration](configuration.md). For the broader docs map, see the [Docs Hub](README.md).

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

## Mod Props

Use `modProps` to expose modifier keys as direct component props instead of requiring the `mods` object:

```jsx
// Before: mods object
<Button mods={{ isLoading: true, size: 'large' }}>Submit</Button>

// After: mod props
<Button isLoading size="large">Submit</Button>
```

### Array form

List modifier key names. Types default to `ModValue` (`boolean | string | number | undefined | null`):

```jsx
const Button = tasty({
  modProps: ['isLoading', 'isSelected'] as const,
  styles: {
    fill: { '': '#surface', isLoading: '#surface.5' },
    border: { '': '1bw solid #outline', isSelected: '2bw solid #primary' },
  },
});

<Button isLoading isSelected>Submit</Button>
// Renders: <button data-is-loading="" data-is-selected="">Submit</button>
```

### Object form (typed)

Map modifier names to type descriptors for precise TypeScript types:

```tsx
const Button = tasty({
  modProps: {
    isLoading: Boolean,   // isLoading?: boolean
    isSelected: Boolean,  // isSelected?: boolean
    size: ['small', 'medium', 'large'] as const,  // size?: 'small' | 'medium' | 'large'
  },
  styles: {
    padding: { '': '2x 4x', 'size=small': '1x 2x', 'size=large': '3x 6x' },
    fill: { '': '#surface', isLoading: '#surface.5' },
  },
});

<Button isLoading size="large">Submit</Button>
// Renders: <button data-is-loading="" data-size="large">Submit</button>
```

Available type descriptors:

| Descriptor | TypeScript type | Example |
|---|---|---|
| `Boolean` | `boolean` | `isLoading: Boolean` |
| `String` | `string` | `label: String` |
| `Number` | `number` | `count: Number` |
| `['a', 'b'] as const` | `'a' \| 'b'` | `size: ['sm', 'md', 'lg'] as const` |

### Merge with `mods`

Mod props and the `mods` object can be used together. Mod props take precedence:

```jsx
<Button mods={{ isLoading: false, extra: true }} isLoading>
// isLoading=true wins (from mod prop), extra=true preserved from mods
```

### When to use `modProps` vs `mods`

| Use case | Recommendation |
|---|---|
| Component has a fixed set of known modifiers | `modProps` — cleaner API, better TypeScript autocomplete |
| Component needs arbitrary/dynamic modifiers | `mods` — open-ended `Record<string, ModValue>` |
| Both fixed and dynamic | Combine: `modProps` for known keys, `mods` for ad-hoc |

For architecture guidance on when to use modifiers vs `styleProps`, see [Methodology — modProps and mods](methodology.md#modprops-and-mods).

---

## Token Props

Use `tokenProps` to expose token keys as direct component props instead of requiring the `tokens` object:

```jsx
// Before: tokens object
<ProgressBar tokens={{ $progress: '75%', '#accent': '#purple' }} />

// After: token props
<ProgressBar progress="75%" accentColor="#purple" />
```

### Array form

List prop names. Names ending in `Color` map to `#` color tokens; everything else maps to `$` custom property tokens:

```jsx
const ProgressBar = tasty({
  tokenProps: ['progress', 'accentColor'] as const,
  styles: { width: '$progress', fill: '#accent' },
});

<ProgressBar progress="75%" accentColor="#purple" />
// 'progress'    → $progress    → --progress
// 'accentColor' → #accent      → --accent-color + --accent-color-oklch
```

### Object form

Map prop names to explicit `$`/`#`-prefixed token keys:

```tsx
const Card = tasty({
  tokenProps: {
    size: '$card-size',
    color: '#card-accent',
  },
  styles: { padding: '$card-size', fill: '#card-accent' },
});

<Card size="4x" color="#purple" />
```

### Merge with `tokens`

Token props and the `tokens` prop can be used together. Token props take precedence over `tokens`, which takes precedence over default `tokens` in `tasty({...})`:

```jsx
const Bar = tasty({
  tokenProps: ['progress'] as const,
  tokens: { $progress: '0%' },  // default
});

<Bar tokens={{ $progress: '50%' }} progress="90%" />
// progress="90%" wins (from token prop)
```

### When to use `tokenProps` vs `tokens`

| Use case | Recommendation |
|---|---|
| Component has a fixed set of known token keys | `tokenProps` — cleaner API, better TypeScript autocomplete |
| Component needs arbitrary/dynamic token values | `tokens` — open-ended `Record<string, TokenValue>` |
| Both fixed and dynamic | Combine: `tokenProps` for known keys, `tokens` for ad-hoc |

For architecture guidance, see [Methodology — tokenProps](methodology.md#tokenprops).

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

The `$` property inside a sub-element's styles controls how its selector attaches to the root selector — combinators, HTML tags, pseudo-elements, the `@` placeholder, and more. For the full reference table and injection rules, see [DSL — Selector Affix](dsl.md#selector-affix-).

For the mental model behind sub-elements — how they share root state context and how this differs from BEM — see [Methodology — Component architecture](methodology.md#component-architecture-root--sub-elements).

---

## computeStyles

Hook-free, synchronous style computation. Can be used anywhere — including React Server Components, plain functions, and non-React code:

```tsx
import { computeStyles } from '@tenphi/tasty';

const { className } = computeStyles({
  padding: '2x',
  fill: '#surface',
  radius: '1r',
});
```

On the client, CSS is injected synchronously into the DOM (idempotent via the injector cache). On the server, CSS is collected via the SSR collector if one is available. This is the same function that `tasty()` components use internally.

---

## Hooks

### useStyles

Generate a className from a style object. Thin wrapper around `computeStyles()` that adds React context-based SSR collector discovery for backward compatibility:

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

### useFontFace

Inject `@font-face` rules for custom fonts. Permanent — no cleanup on unmount. Deduplicates by content.

```tsx
import { useFontFace } from '@tenphi/tasty';

function App() {
  useFontFace('Brand Sans', {
    src: 'url("/fonts/brand-sans.woff2") format("woff2")',
    fontWeight: '400 700',
    fontDisplay: 'swap',
  });

  return <div style={{ fontFamily: '"Brand Sans", sans-serif' }}>Hello</div>;
}
```

For multiple weights/styles, pass an array:

```tsx
useFontFace('Brand Sans', [
  { src: 'url("/fonts/brand-regular.woff2") format("woff2")', fontWeight: 400, fontDisplay: 'swap' },
  { src: 'url("/fonts/brand-bold.woff2") format("woff2")', fontWeight: 700, fontDisplay: 'swap' },
]);
```

Signature:

```ts
function useFontFace(family: string, input: FontFaceInput): void;
```

### useCounterStyle

Inject a `@counter-style` rule and get back the counter style name. Permanent — no cleanup on unmount. Deduplicates by name.

```tsx
import { useCounterStyle } from '@tenphi/tasty';

function EmojiList() {
  const styleName = useCounterStyle({
    system: 'cyclic',
    symbols: '"👍"',
    suffix: '" "',
  }, { name: 'thumbs' });

  return (
    <ol style={{ listStyleType: styleName }}>
      <li>First</li>
      <li>Second</li>
    </ol>
  );
}
```

Factory form with dependencies:

```tsx
function DynamicList({ marker }: { marker: string }) {
  const styleName = useCounterStyle(
    () => ({
      system: 'cyclic',
      symbols: `"${marker}"`,
      suffix: '" "',
    }),
    [marker],
  );

  return <ol style={{ listStyleType: styleName }}>...</ol>;
}
```

Signatures:

```ts
function useCounterStyle(
  descriptors: CounterStyleDescriptors,
  options?: { name?: string; root?: Document | ShadowRoot },
): string;

function useCounterStyle(
  factory: () => CounterStyleDescriptors,
  deps: readonly unknown[],
  options?: { name?: string; root?: Document | ShadowRoot },
): string;
```

### Troubleshooting

- Styles are not updating: make sure `configure()` runs before first render, and verify the generated class name or global rule with [Debug Utilities](debug.md).
- SSR output looks wrong: check the [SSR guide](ssr.md) for collector setup. `computeStyles()` discovers the SSR collector via `AsyncLocalStorage` or the global getter registered by `TastyRegistry`.
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
