# React API

The React-specific `tasty()` component factory, component props, and style functions. All Tasty style functions — `tasty()` components, `useStyles()`, `useGlobalStyles()`, `useRawCSS()`, `useKeyframes()`, `useProperty()`, `useFontFace()`, `useCounterStyle()`, and `useFunction()` — are hook-free and compatible with React Server Components. No `'use client'` directive needed. For the shared style language (state maps, tokens, units, extending semantics), see [Style DSL](dsl.md). For global configuration, see [Configuration](configuration.md). For the broader docs map, see the [Docs Hub](README.md).

> **Note:** This file was previously named `runtime.md`. All functionality documented here works in both server and client contexts — "runtime" referred to style computation during React rendering, not to client-side JavaScript.

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

`tasty(Component, ...)` always wraps `Component` and forwards every prop to it, so `Component` must be Tasty-aware (i.e. it accepts `styles`, `mods`, `qa`, etc. and renders them through its own Tasty pipeline). To apply styles to a third-party component or a string DOM tag via `className`, use the options-only form with `as`:

```jsx
import NextLink from 'next/link';

const Link = tasty({
  as: NextLink,
  styles: {
    color: { '': '#accent-text', ':hover': '#text' },
    textDecoration: 'underline',
  },
  styleProps: ['padding'],
});

const Span = tasty({
  as: 'span',
  styles: { preset: 'strong' },
});

<Link href="/blog" padding="1x">Blog</Link>;
```

The wrapped component only needs to forward `className` (and ideally `style`/`ref`). Tasty-specific props (`qa`, `qaVal`, `mods`, `tokens`, `styleProps`, `modProps`, `tokenProps`) are consumed by Tasty and never leak to the DOM.

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

### Always-available style props

A small set of style properties — `display`, `font`, `preset`, `hide`, `whiteSpace`, `opacity`, and `transition` — are always harvested as style props on every `tasty()` component, even when `styleProps` is omitted. This means you can pass `<Card display="grid" />` or `<Text preset="h1" />` without declaring them. When you do declare `styleProps`, these base props are unioned with your list (not replaced).

---

## `Element`

`Element` is the unstyled base component exported from the main entry — equivalent to `tasty({})` (a `div` with no default styles). It accepts all Tasty props (`styles`, `styleProps`, `mods`, `tokens`, `as`, `qa`, `theme`, the `is*` props, etc.) and is useful as a generic styled box or as a building block for layout primitives.

```jsx
import { Element } from '@tenphi/tasty';

<Element as="section" padding="4x" fill="#surface">
  Content
</Element>
```

> Note: `Element` shadows the global DOM `Element` type when imported from `@tenphi/tasty`. In files that need the DOM type, alias the import: `import { Element as TastyElement } from '@tenphi/tasty'`.

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
// 'accentColor' → #accent      → --accent-color
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
    outline: { fill: '#clear', color: '#blue', border: '1bw solid #blue' },
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

## Style Functions

All style functions below are plain functions (not React hooks) and can be used in any environment: client components, SSR with a `ServerStyleCollector`, and React Server Components. They retain their `use` prefix for backward compatibility, but do not use any React hooks internally.

In server-only contexts (Next.js RSC without `'use client'`, Astro without `client:*` directives, SSG), components that use only Tasty style functions produce zero client JavaScript. Tasty never forces the `'use client'` boundary — that decision belongs to your component when it needs React interactivity (state, effects, event handlers).

### useStyles

Generate a className from a style object. Thin wrapper around `computeStyles()`:

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

Inject global styles for a CSS selector. Accepts an optional third argument with an `id` for update tracking — when the styles change, the previous injection is disposed and the new one is injected:

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

A slot — the `id`, or the selector when no `id` is given — holds exactly one
injection **per `root`**. So:

- Changing the styles replaces the previous CSS rather than adding to it.
- Passing styles that produce no CSS (for example `{}`) clears the slot.
- The same selector used in two shadow roots keeps a separate injection in each.
- Two independent call sites that share a selector share a slot, and the last
  render wins. Give them distinct `id`s if they should coexist.

### useRawCSS

Inject raw CSS strings. Accepts an optional `id` in the options for update tracking — when the CSS changes for the same id, the previous injection is replaced:

```tsx
import { useRawCSS } from '@tenphi/tasty';

function GlobalReset() {
  useRawCSS(`
    body { margin: 0; padding: 0; }
  `);

  return null;
}
```

An `id` slot holds one injection per `root`. Without an `id` the CSS is deduped
by content and permanent — there is nothing to replace it with later.

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

`useKeyframes()` also supports a factory function. Without a `name` the factory runs on every invocation and deduplication is handled internally by content hash; with a `name`, matching deps skip the factory entirely:

```tsx
function Pulse({ scale }: { scale: number }) {
  const pulse = useKeyframes(
    () => ({
      '0%': { transform: 'scale(1)' },
      '100%': { transform: `scale(${scale})` },
    }),
    [scale],
    { name: 'pulse' }
  );

  return <div style={{ animation: `${pulse} 500ms ease-in-out alternate infinite` }} />;
}
```

Passing `name` claims a slot owned by that one call site, per `root` — much like
`id` in `useGlobalStyles()` and `useRawCSS()`. When the steps change the previous
`@keyframes` rule is disposed and the name is reused, so the rules don't
accumulate and the returned name stays stable. Anonymous keyframes are permanent
and shared by content.

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

Signature:

```ts
function useCounterStyle(
  descriptors: CounterStyleDescriptors,
  options?: { name?: string; root?: Document | ShadowRoot },
): string;
```

### useFunction

Register a CSS `@function` (custom function). Permanent — no cleanup on unmount. Deduplicates by function name. The function name accepts `$$name` (matching the call site `$$name(...)`), `$name`, or `--name`.

```tsx
import { tasty, useFunction } from '@tenphi/tasty';

const Box = tasty({ styles: { margin: '$$negative(10px) top' } });

function Layout() {
  useFunction('$$negative', { args: ['$value'], result: '(-1 * $value)' });
  return <Box />;
}
```

Call the function through the Tasty DSL rather than a raw `style` prop. An inline `style` value reaches the browser unparsed, so the `$$name(...)` sugar is never expanded — and under `configure({ polyfills: { functions: true } })` it silently does nothing, because the polyfill rewrites calls at parse time.

Inside a `tasty()` component you call functions with the same `$$name(...)` sugar:

```tsx
const Box = tasty({
  styles: {
    '@function': { '$$negative': { args: ['$value'], result: '(-1 * $value)' } },
    margin: '$$negative(10px) top',
  },
});
```

Signature:

```ts
function useFunction(
  name: string,
  definition: FunctionDefinition,
  options?: { root?: Document | ShadowRoot },
): void;
```

See the [Functions section of the DSL reference](dsl.md#functions-function) for the full descriptor shape, token conventions, and value-sugar support. `@function` is an experimental CSS feature — unsupported browsers safely ignore the native rule, or enable the [`polyfills.functions`](configuration.md#polyfills) inline polyfill for full cross-browser support.

### Troubleshooting

- Styles are not updating: make sure `configure()` runs before first render, and verify the generated class name or global rule with [Debug Utilities](debug.md).
- SSR output looks wrong: check the [SSR guide](ssr.md) for collector setup. All style functions discover the SSR collector via `AsyncLocalStorage` or the global getter registered by `TastyRegistry`.
- Animation/custom property issues: prefer `useKeyframes()` and `useProperty()` over raw CSS when you want Tasty to manage injection and SSR collection for you.
- For dynamic styles that change over the component lifecycle, use the `id` option in `useGlobalStyles()` and `useRawCSS()` to enable update tracking.
- RSC inline mode: CSS accumulated by standalone style functions (`useGlobalStyles`, `useRawCSS`, etc.) is flushed into inline `<style>` tags by the next `tasty()` component in the render tree. If your page uses only standalone style functions without any `tasty()` component, the CSS will not be emitted. Ensure at least one `tasty()` component is present in each RSC render tree.

---

## Learn more

- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[Methodology](methodology.md)** — Recommended patterns: root + sub-elements, styleProps, tokens, wrapping
- **[Configuration](configuration.md)** — Tokens, recipes, custom units, style handlers, TypeScript extensions
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
- **[Zero Runtime (tastyStatic)](tasty-static.md)** — Build-time static styling with Babel plugin
- **[Server-Side Rendering](ssr.md)** — SSR setup for Next.js, Astro, and generic frameworks
- **[Debug Utilities](debug.md)** — Inspect injected CSS, cache state, and active styles at runtime
