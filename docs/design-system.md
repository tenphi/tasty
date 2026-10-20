# Building a Design System

This guide shows how to build shared React components whose styles stay predictable as states, variants, themes, and responsive rules accumulate. You will define tokens, state aliases, recipes, primitive APIs, and compound components with sub-elements.

It assumes you have already decided to adopt Tasty. The goal is not only to centralize values, but to give your design system one state model and a governed component-facing styling API. For evaluation criteria and incremental rollout, see the [Adoption Guide](adoption.md). For the recommended component architecture, see [Methodology](methodology.md).

---

## Designing your token vocabulary

Tokens are the foundation of a design system. In Tasty, tokens are defined via `configure({ tokens })` and referenced in styles with `#name` (colors) or `$name` (values). See [Configuration — Design Tokens](configuration.md#design-tokens) for the API.

### Color tokens

Adopt a semantic naming convention that maps intent, not visual appearance. Define tokens via `configure({ tokens })`:

```tsx
import { configure } from '@tenphi/tasty';

configure({
  tokens: {
    // Surfaces
    '#surface': '#fff',
    '#surface-hover': '#f5f5f5',
    '#surface-pressed': '#ebebeb',

    // Primary action
    '#primary': 'oklch(55% 0.25 265)',
    '#primary-hover': 'oklch(50% 0.25 265)',
    '#primary-pressed': 'oklch(45% 0.25 265)',
    '#on-primary': '#fff',

    // Semantic
    '#danger': 'oklch(55% 0.22 25)',
    '#danger-hover': 'oklch(50% 0.22 25)',
    '#on-danger': '#fff',

    // Text
    '#text': '#111',
    '#text-secondary': '#666',

    // Borders
    '#border': '#e0e0e0',

    // Spacing and shape scale
    $gap: '8px',
    $radius: '4px',
    '$border-width': '1px',
    '$outline-width': '2px',
  },
  // Built-in units compile to fixed values by default. Pointing them at the
  // tokens above lets a theme or density mode change the scale at runtime.
  units: {
    x: 'var(--gap)', // 2x → calc(2 * var(--gap))
    r: 'var(--radius)',
    bw: 'var(--border-width)',
    ow: 'var(--outline-width)',
  },
});
```

Leave out the `units` block to keep the built-in fixed scale (`x` = `8px`, `r` = `6px`, `bw` = `1px`, `ow` = `3px`), or set fixed values there instead (`units: { x: '8px', r: '4px' }`). Define the token a unit points at; until you do, `--gap`, `--radius`, `--border-width`, and `--outline-width` start at the built-in unit values. Boolean shorthands follow the same scale: `radius: true` is `1r`, `border: true` is `1bw`, and `outline: true` is `1ow`. See [Built-in Units](dsl.md#built-in-units).

Tokens are injected as CSS custom properties on `:root` when the first style is rendered. They support state maps for theme-aware values:

```tsx
configure({
  tokens: {
    '#primary': {
      '': 'oklch(55% 0.25 265)',
      '@dark': 'oklch(75% 0.2 265)',
    },
  },
});
```

The `#on-*` convention names the text color that sits on top of a fill — `#on-primary` is the text color on a `#primary` background. This makes state maps self-documenting: `fill: '#primary'` and `color: '#on-primary'` clearly belong together.

To generate the whole palette instead of hand-picking values, use [Glaze](https://github.com/tenphi/glaze): it builds light, dark, and high-contrast variants from one hue in the OKHST color space, solves WCAG and APCA contrast, and exports Tasty tokens you can pass straight to `configure({ tokens: theme.tasty() })`.

### Replace tokens for value aliases

`configure({ replaceTokens })` replaces tokens with literal values at parse time, baking them into the generated CSS. Use it for value aliases that should be inlined during style generation:

```tsx
configure({
  replaceTokens: {
    '$card-padding': '4x',
    '$input-height': '5x',
    '$sidebar-width': '280px',
  },
});
```

### Typography presets

Pass typography presets directly to `configure()` — they are converted to tokens automatically:

```tsx
import { configure } from '@tenphi/tasty';

configure({
  presets: {
    h1: {
      fontSize: '2rem',
      lineHeight: '1.2',
      letterSpacing: '-0.02em',
      fontWeight: 700,
    },
    t2: {
      fontSize: '0.875rem',
      lineHeight: '1.5',
      letterSpacing: 'normal',
      fontWeight: 400,
    },
  },
});
```

Preset values support state maps for responsive or theme-aware typography:

```tsx
configure({
  presets: {
    t2: {
      fontSize: '0.875rem',
      lineHeight: '1.5',
      fontWeight: { '': 400, '@dark': 300 },
    },
  },
});
```

Then use `preset: 'h1'` or `preset: 't2'` in any component's styles.

> You can also call `generateTypographyTokens()` manually and spread the result into `tokens` for more control — `presets` is just a shorthand.

### Registering brand fonts

Register your design system's custom fonts via `configure({ fontFaces })` so every component can reference them:

```ts
configure({
  fontFaces: {
    'Brand Sans': [
      {
        src: 'url("/fonts/brand-regular.woff2") format("woff2")',
        fontWeight: 400,
        fontDisplay: 'swap',
      },
      {
        src: 'url("/fonts/brand-bold.woff2") format("woff2")',
        fontWeight: 700,
        fontDisplay: 'swap',
      },
    ],
  },
});
```

See [Font Face](configuration.md#font-face) for the full configuration reference.

---

## Defining state aliases

State aliases let you write `@mobile` instead of `@media(w < 768px)` in every component. Define them once in `configure()`:

```tsx
configure({
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(768px <= w < 1024px)',
    '@desktop': '@media(w >= 1024px)',
    '@dark':
      '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
    '@reduced-motion': '@media(prefers-reduced-motion: reduce)',
  },
});
```

Every component can now use these without repeating the query logic:

```tsx
const Card = tasty({
  styles: {
    padding: { '': '4x', '@mobile': '2x' },
    flow: { '': 'row', '@mobile': 'column' },
    radius: { '': '1r', '@mobile': '0' },
  },
});
```

Theme switching belongs in tokens (`'#surface': { '': '#fff', '@dark': '#1c1c1e' }`) rather than in component state maps, so components stay theme-agnostic.

Without aliases, the same component would need the full media query expression inlined in every state map — across every property, in every component. Aliases eliminate that duplication.

---

## Creating recipes

Recipes are named style bundles for patterns that repeat across components. Define them in `configure()`:

```tsx
configure({
  recipes: {
    card: {
      padding: '4x',
      fill: '#surface',
      radius: '1r',
      border: true,
    },
    elevated: {
      shadow: '0 2x 4x #shadow',
    },
    'input-reset': {
      border: 'none',
      outline: 'none',
      fill: '#clear',
      font: true,
      preset: 't3',
    },
    interactive: {
      cursor: { '': 'pointer', disabled: 'not-allowed' },
      opacity: { '': '1', disabled: '.5' },
      transition: 'theme',
    },
  },
});
```

Components reference recipes by name. This keeps component definitions lean while ensuring consistency:

```tsx
const ProfileCard = tasty({
  styles: {
    recipe: 'card elevated',
    color: '#text',
    Title: { preset: 'h3', color: '#primary' },
  },
  elements: { Title: 'h2' },
});
```

Use the `/` separator when a recipe should be applied _after_ local styles (post-merge), so recipe states take priority:

```tsx
const Input = tasty({
  styles: {
    recipe: 'input-reset / interactive',
    padding: '1.5x 2x',
    border: '1bw solid #border',
  },
});
```

See [Configuration — Recipes](configuration.md#recipes) for the API and [Style DSL — Recipes](dsl.md#recipes) for composition patterns.

---

## Building primitive components

Primitives are the layout and utility components that product engineers compose. They expose a controlled set of style props and have minimal opinions about appearance.

### Layout primitives

```tsx
import { tasty, FLOW_STYLES, POSITION_STYLES } from '@tenphi/tasty';

const Space = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    flow: 'column',
    gap: '1x',
  },
  styleProps: FLOW_STYLES,
});

const Box = tasty({
  as: 'div',
  styles: {
    display: 'block',
  },
  styleProps: [...FLOW_STYLES, ...POSITION_STYLES, 'padding', 'fill', 'radius'],
});

const Grid = tasty({
  as: 'div',
  styles: {
    display: 'grid',
    gap: '1x',
  },
  styleProps: FLOW_STYLES, // includes gridColumns, gridRows, gridAreas
});
```

Product engineers use these to compose layouts without writing CSS:

```tsx
<Space flow="row" gap="2x" placeItems="center">
  <Title>Dashboard</Title>
  <Button placeSelf="end">Add Item</Button>
</Space>

<Grid gridColumns={{ '': '1fr', '@tablet': '1fr 1fr', '@desktop': '1fr 1fr 1fr' }} gap="3x">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</Grid>
```

### Interactive components with variants

Variants are named looks that replace each other. Combine them with `modProps` for states that stack, such as size or loading:

```tsx
const Button = tasty({
  as: 'button',
  modProps: { size: ['sm', 'md', 'lg'] as const },
  styles: {
    recipe: 'interactive',
    padding: { '': '1.5x 3x', 'size=sm': '1x 2x', 'size=lg': '2x 4x' },
    radius: '1r',
  },
  variants: {
    default: {
      fill: {
        '': '#primary',
        ':hover': '#primary-hover',
        disabled: '#surface',
      },
      color: '#on-primary',
    },
    danger: {
      fill: { '': '#danger', ':hover': '#danger-hover', disabled: '#surface' },
      color: '#on-danger',
    },
  },
});

<Button variant="danger" size="lg">
  Delete
</Button>;
```

`variant` is typed from the keys, the `default` variant applies when no `variant` prop is passed (or the variant the `variant` option names, such as `variant: 'danger'`), and only the variants that actually render emit CSS. See [React API — Variants](react-api.md#variants).

### Which styleProps to expose

Match the prop set to the component's role:

| Component category                         | Recommended styleProps                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Layout containers (`Space`, `Box`, `Grid`) | `FLOW_STYLES` — flow, gap, align/justify/place, grid templates (add `padding` or `fill` explicitly) |
| Positioned elements (`Button`, `Badge`)    | `POSITION_STYLES` — placeSelf, gridArea, order                                                      |
| Text elements                              | `['color', ...TEXT_STYLES]` (`preset` is always available)                                          |
| Compound components                        | Typically none — styling happens via sub-elements and wrapping                                      |

`BASE_STYLES` (`display`, `font`, `preset`, `hide`, `whiteSpace`, `opacity`, `transition`) are accepted as props on every component without being listed. Exposing too many props weakens the design system's constraints. See [Methodology — styleProps as the public API](methodology.md#styleprops-as-the-public-api) for the rationale.

---

## Building compound components

Compound components have inner parts — a card has a title, content, and footer; a dialog has a header, body, and actions. Tasty models these as sub-elements.

```tsx
const Card = tasty({
  styles: {
    recipe: 'card',
    flow: 'column',
    gap: '2x',

    Title: {
      preset: 'h3',
      color: '#primary',
    },
    Content: {
      preset: 't2',
      color: '#text',
    },
    Footer: {
      display: 'flex',
      flow: 'row',
      gap: '1x',
      justify: 'flex-end',
      padding: '2x top',
      border: '1bw solid #border top',
    },
  },
  elements: {
    Title: 'h2',
    Content: 'div',
    Footer: 'div',
  },
});
```

Usage:

```tsx
<Card>
  <Card.Title>Monthly Revenue</Card.Title>
  <Card.Content>$1.2M — up 12% from last month.</Card.Content>
  <Card.Footer>
    <Button>Details</Button>
  </Card.Footer>
</Card>
```

Sub-elements share the root component's state context by default. A `disabled` modifier on `<Card>` affects `Title`, `Content`, and `Footer` styles automatically — no prop drilling. For the full mental model, see [Methodology — Component architecture](methodology.md#component-architecture-root--sub-elements).

For sub-element syntax details (selector affix `$`, `@own()`, `elements` config), see [React API — Sub-element Styling](react-api.md#sub-element-styling).

---

## Defining the override contract

A design system works best when the rules for customization are explicit. Tasty gives product engineers four sanctioned ways to customize a component, and a few to discourage:

### What product engineers can do

1. **Use styleProps** — adjust layout, spacing, positioning through the props the component exposes:

```tsx
<Space flow="row" gap="3x" placeItems="center">
```

2. **Use modProps** — control component states through typed props instead of `mods`:

```tsx
<Button isLoading size="large">
  Submit
</Button>
```

3. **Pass tokens** — inject runtime values through the `tokens` prop for per-instance customization:

```tsx
<ProgressBar tokens={{ $progress: `${percent}%` }} />
```

4. **Create styled wrappers** — extend a component's styles with `tasty(Base, { styles })`:

```tsx
const DangerButton = tasty(Button, {
  styles: {
    fill: {
      '': '#danger',
      ':hover': '#danger-hover',
      ':active': '#danger-pressed',
      disabled: '@inherit', // a map with '' replaces the parent's; keep its disabled branch
    },
    color: '#on-danger',
  },
});
```

### What to discourage

- **Direct `styles` prop** — bypasses the component's intended API; prefer styled wrappers
- **`style` prop** — React inline styles that bypass Tasty entirely; reserve for third-party integration only
- **Overriding internal sub-elements** — if product engineers need to restyle sub-elements, the DS component should expose that through its own API (additional props or variants), not through raw `styles` overrides

See [Methodology — styles prop vs style prop](methodology.md#styles-prop-vs-style-prop) and [Methodology — Wrapping and extension](methodology.md#wrapping-and-extension) for the full rationale.

---

## Guardrails: linting and types

A vocabulary only holds if mistakes surface early. Register the same names you pass to `configure()` with the ESLint plugin and with TypeScript:

```ts
// tasty.config.ts — read by @tenphi/eslint-plugin-tasty
export default {
  tokens: ['#surface', '#text', '#primary', '#danger', '$gap', '$radius'],
  states: ['@mobile', '@tablet', '@desktop', '@dark', '@reduced-motion'],
  presets: ['h1', 'h2', 'h3', 't2', 't3'],
  recipes: ['card', 'elevated', 'input-reset', 'interactive'],
  importSources: ['@my-org/ds'], // where product code imports tasty() from
};
```

```js
// eslint.config.js
import tasty from '@tenphi/eslint-plugin-tasty';

export default [tasty.configs.recommended]; // or tasty.configs.strict
```

```ts
// tasty.d.ts
import '@tenphi/tasty';

declare module '@tenphi/tasty' {
  interface TastyNamedColors {
    surface: true;
    text: true;
    primary: true;
    danger: true;
  }
  interface TastyPresetNames {
    h1: true;
    h2: true;
    h3: true;
    t2: true;
    t3: true;
  }
}
```

Unknown colors, presets, and recipes then fail lint (`valid-color-token`, `valid-preset`, `valid-recipe`), and `strict` adds checks for unknown `$` tokens and state aliases (`valid-custom-property`, `no-unknown-state-alias`). The same names autocomplete in editors. Deriving both lists from the same token and recipe modules that `config.ts` imports keeps all three in sync.

---

## Project structure

A recommended structure for a design system built on Tasty:

```
ds/
  config.ts              # configure() — tokens, units, states, recipes
  tasty.config.ts        # Names the ESLint plugin validates against
  tasty.d.ts             # TypeScript augmentation for autocomplete
  primitives/
    Space.tsx             # Layout: flex container with FLOW_STYLES
    Box.tsx               # Generic container
    Grid.tsx              # Grid container
    Text.tsx              # Text element with preset + color
  components/
    Button.tsx            # Interactive component with variants
    Card.tsx              # Compound component with sub-elements
    Input.tsx             # Form input with recipes
    Dialog.tsx            # Overlay compound component
  recipes/
    index.ts              # Recipe definitions (imported by config.ts)
  tokens/
    colors.ts             # Color token definitions
    typography.ts         # Typography presets for configure({ presets })
    units.ts              # Spacing and shape scale for configure({ units })
  index.ts                # Public API: re-exports components + configure
```

The key principle: `config.ts` imports tokens and recipes, calls `configure()`, and is imported at the app entry point before any component renders. Components import only from `@tenphi/tasty` — they reference tokens and recipes by name, not by import.

---

## Learn more

- **[Methodology](methodology.md)** — The recommended patterns for structuring Tasty components
- **[Getting Started](getting-started.md)** — Installation, first component, tooling setup
- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[React API](react-api.md)** — `tasty()` factory, component props, variants, sub-elements, style functions
- **[Configuration](configuration.md)** — Full `configure()` API: tokens, recipes, custom units, style handlers
- **[Adoption Guide](adoption.md)** — Who should adopt Tasty, incremental phases, what changes for product engineers
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
