# Adoption Guide

Tasty is not a drop-in replacement for another styling library. It is a **substrate for building a design-system-defined styling language**. That means the adoption path is not "rewrite your classes" but "reshape your styling architecture."

This guide is for design-system maintainers and platform engineers evaluating Tasty or introducing it into an existing codebase.

---

## Where Tasty sits in the stack

Tasty is not the surface your product engineers interact with directly. It sits one layer below:

```
Product code
  └─ DS components (Button, Card, Layout, ...)
       └─ Tasty engine (tasty(), configure(), hooks)
            └─ CSS (mutually exclusive selectors, tokens, custom properties)
```

**What Tasty owns:**
- The DSL and value parser (tokens, custom units, auto-calc, color opacity)
- State compilation (mutually exclusive selectors from state maps)
- Style injection and deduplication (runtime or build-time)
- The `tasty()` component factory and hooks API

**What the DS team owns:**
- Token names and values (colors, spacing, typography)
- Custom units and their semantics
- State aliases (`@mobile`, `@dark`, `@compact`)
- Recipes (reusable style bundles)
- Which style props each component exposes
- Sub-element structure for compound components
- The override and extension rules product teams follow

Two teams using Tasty can end up with very different authoring models. That is by design.

---

## Who should adopt Tasty

**Strong fit:**
- A design-system or platform team that wants to define a governed styling language
- Components with complex, intersecting states (hover + disabled + theme + breakpoint)
- Teams that need deterministic style resolution without cascade/specificity bugs
- Organizations where styling decisions should be centralized, not distributed

**Not the right fit:**
- Solo developers building a one-off app with minimal UI structure
- Teams that want a shared utility vocabulary and direct markup authoring (Tailwind is better here)
- Projects where low ceremony matters more than central governance
- Codebases where intersecting state complexity is low

For a detailed comparison with Tailwind, Panda CSS, vanilla-extract, StyleX, Stitches, and Emotion, see the [Comparison guide](comparison.md).

---

## What you are expected to define

Tasty provides the engine. The DS team defines the language that runs on it. Here is what that typically involves:

| Layer | What you define | Where |
|-------|----------------|-------|
| **Tokens** | Color names, spacing scale, border widths, radii | `configure({ tokens })` |
| **Units** | Custom multiplier units (`x`, `r`, `bw`, or your own) | `configure({ units })` |
| **State aliases** | Responsive breakpoints, theme modes, feature flags | `configure({ states })` |
| **Recipes** | Reusable style bundles (card, elevated, input-reset) | `configure({ recipes })` |
| **Typography** | Preset definitions (h1-h6, t1-t4, etc.) | CSS custom properties or `configure({ tokens })` |
| **Style props** | Which CSS properties each component exposes as React props | `styleProps` in each component |
| **Sub-elements** | Inner parts of compound components (Title, Icon, Content) | `elements` + capitalized keys in `styles` |
| **Override rules** | How product engineers extend or constrain components | Styled wrappers via `tasty(Base, { ... })` |

The same engine can power a minimal design system with a handful of tokens:

```tsx
configure({
  tokens: { '#bg': '#white', '#text': '#111' },
  states: { '@dark': '@root(theme=dark)' },
});
```

...or an enterprise-scale system with dozens of tokens, multiple state aliases, typography presets, recipes, and custom units. The scope is yours to decide.

Here is how the layers connect end-to-end. The DS team configures the engine, defines components, and product engineers consume them:

```tsx
// ds/config.ts — DS team defines the language
configure({
  tokens: { '#primary': 'oklch(55% 0.25 265)', '#surface': '#fff', '#text': '#111' },
  states: { '@mobile': '@media(w < 768px)', '@dark': '@root(schema=dark)' },
  recipes: { card: { padding: '4x', fill: '#surface', radius: '1r', border: true } },
});

// ds/components/Card.tsx — DS team builds components on top
const Card = tasty({
  styles: {
    recipe: 'card',
    Title: { preset: 'h3', color: '#primary' },
    Body: { preset: 't2', color: '#text' },
  },
  elements: { Title: 'h2', Body: 'div' },
  styleProps: ['padding', 'fill'],
});

// app/Dashboard.tsx — product engineer uses the component
<Card padding={{ '': '4x', '@mobile': '2x' }}>
  <Card.Title>Monthly Revenue</Card.Title>
  <Card.Body>$1.2M — up 12% from last month</Card.Body>
</Card>
```

See [Configuration](configuration.md) for the full `configure()` API.

---

## Incremental adoption

You do not need to adopt everything at once. Tasty is designed to be introduced layer by layer.

### Phase 1 -- Tokens and units

Start by defining your design tokens and custom units. This is the lowest-risk step: it only configures the parser and does not require rewriting any components.

```tsx
import { configure } from '@tenphi/tasty';

configure({
  tokens: {
    '#primary': 'oklch(55% 0.25 265)',
    '#surface': '#white',
    '#text': '#111',
    '$card-padding': '4x',
  },
  // Common units (x, r, bw, ow, cr) are built-in.
  // A DS typically redefines them to use CSS custom properties
  // so that the actual scale is controlled via CSS, not JS:
  units: {
    x: 'var(--gap)',   // 2x → calc(var(--gap) * 2)
    r: 'var(--radius)',
    bw: 'var(--border-width)',
  },
});
```

### Phase 2 -- State aliases and recipes

Define the state vocabulary your components will share. This is where you start encoding your team's conventions.

```tsx
configure({
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(w < 1024px)',
    '@dark': '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
  },
  recipes: {
    card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
    elevated: { shadow: '0 2x 4x #shadow' },
  },
});
```

### Phase 3 -- Migrate a few primitives

Pick 2-3 simple, widely used components (Box, Text, Button) and rewrite them with `tasty()`. Keep the public API identical so product code does not need to change.

```tsx
const Box = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    flow: 'column',
    gap: '1x',
  },
  styleProps: ['gap', 'flow', 'padding', 'fill'],
});
```

At this point you can validate the DSL, token workflow, and component authoring experience before committing further.

### Phase 4 -- Encode complex states

Move components with intersecting states (buttons with hover + disabled + theme variants, inputs with focus + error + readonly) to Tasty's state map syntax. This is where mutually exclusive selectors start paying off.

```tsx
const Button = tasty({
  as: 'button',
  styles: {
    fill: {
      '': '#primary',
      ':hover': '#primary-hover',
      ':active': '#primary-pressed',
      // `disabled` is a data-attribute modifier → [data-disabled].
      // Tasty auto-applies it from the native `disabled` attribute.
      // `[disabled]` (attribute selector) also works here.
      disabled: '#surface',
    },
    color: {
      '': '#on-primary',
      disabled: '#text.40',
    },
    cursor: {
      '': 'pointer',
      disabled: 'not-allowed',
    },
    transition: 'theme',
  },
});
```

### Phase 5 -- Standardize style props and sub-elements

Define which style props each component category exposes. Layout components get flow/gap/padding. Interactive components get positioning. Compound components declare sub-elements.

```tsx
const Card = tasty({
  styles: {
    recipe: 'card elevated',
    Title: { preset: 'h3', color: '#primary' },
    Content: { color: '#text', preset: 't2' },
  },
  elements: { Title: 'h2', Content: 'div' },
  styleProps: ['padding', 'fill', 'radius'],
});
```

### Phase 6 -- Expand to full DS coverage

Migrate the remaining components, add the [ESLint plugin](https://github.com/tenphi/eslint-plugin-tasty) to enforce style conventions at lint time, and consider [zero-runtime mode](tasty-static.md) for static or performance-critical pages.

---

## What changes for product engineers

When a DS is powered by Tasty, product engineers typically interact with **components, not Tasty itself**. Here is what changes from their perspective:

**They do not write CSS directly.** Styling decisions are embedded in the components the DS provides. Product code consumes components, tokens, and style props.

**Overrides use styled wrappers.** Instead of passing one-off `className` or `style` props, product engineers extend components:

```tsx
import { tasty } from '@tenphi/tasty';
import { Button } from 'my-ds';

// Replace mode: providing '' (default) key replaces the parent's fill entirely
const DangerButton = tasty(Button, {
  styles: {
    fill: { '': '#danger', ':hover': '#danger-hover' },
  },
});

// Extend mode: omitting '' key preserves parent states and adds/overrides
const LoadingButton = tasty(Button, {
  styles: {
    fill: {
      loading: '#yellow',       // new state appended
      disabled: '#gray.20',     // existing state overridden in place
    },
  },
});
```

**Style props replace raw CSS.** Layout, spacing, and positioning are controlled through typed props on the components that expose them:

```tsx
<Space flow="row" gap="2x" placeItems="center">
  <Title>Dashboard</Title>
  <Button placeSelf="end">Add Item</Button>
</Space>
```

**No cascade/specificity concerns.** Tasty's mutually exclusive selectors mean extending a component cannot accidentally break another. Import order, class name collisions, and specificity arithmetic are non-issues.

---

## Learn more

- [README](../README.md) -- overview, quick start, and feature highlights
- [Getting Started](getting-started.md) -- installation, first component, tooling setup
- [Methodology](methodology.md) -- the recommended patterns for structuring Tasty components
- [Building a Design System](design-system.md) -- practical guide to building a DS layer with Tasty
- [Usage Guide](usage.md) -- component creation, state mappings, sub-elements, variants, and hooks
- [Configuration](configuration.md) -- tokens, recipes, custom units, style handlers, and TypeScript extensions
- [Style Properties](styles.md) -- complete reference for all enhanced style properties
- [Comparison](comparison.md) -- positioning and trade-offs vs. other styling systems
- [Zero Runtime (tastyStatic)](tasty-static.md) -- build-time static styling with Babel plugin
