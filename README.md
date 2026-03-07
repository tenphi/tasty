<p align="center">
  <img src="assets/tasty.svg" width="128" height="128" alt="Tasty logo">
</p>

<h1 align="center">Tasty</h1>

<p align="center">
  <strong>The styling engine built for design systems.</strong><br>
  Deterministic CSS generation. State-aware DSL. Zero specificity conflicts. Ever.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tenphi/tasty"><img src="https://img.shields.io/npm/v/@tenphi/tasty.svg" alt="npm version"></a>
  <a href="https://github.com/tenphi/tasty/actions/workflows/ci.yml"><img src="https://github.com/tenphi/tasty/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/tenphi/tasty/blob/main/LICENSE"><img src="https://img.shields.io/github/license/tenphi/tasty" alt="license"></a>
</p>

---

Most CSS-in-JS libraries emit rules that compete through cascade and specificity. Tasty emits **mutually exclusive CSS selectors** — for any component state combination, exactly one selector matches each property at a time. No cascade conflicts, no specificity wars, no `!important` escapes. Components compose and extend without breaking each other.

That guarantee unlocks a concise, CSS-like DSL where design tokens, custom units, responsive states, container queries, sub-element styling, and theming all compose without surprises — one coherent system that scales from a single component to an enterprise design system.

## Why Tasty

- **Deterministic at any scale** — Exclusive selector generation eliminates the entire class of cascade/specificity bugs. Every state combination resolves to exactly one CSS rule per property. Refactor freely.
- **AI-friendly by design** — Style definitions are declarative, self-contained, and structurally consistent. AI tools can read, understand, and refactor even advanced state bindings as confidently as a human — because there's no hidden cascade logic or implicit ordering to second-guess.
- **DSL that feels like CSS** — Property names you already know (`padding`, `color`, `display`) with syntax sugar that removes boilerplate. Learn the DSL in minutes, not days.
- **Design-system native** — Color tokens (`#primary`), spacing units (`2x`), typography presets (`h1`, `t2`), border radius (`1r`), and recipes are first-class primitives, not afterthoughts.
- **Near-complete modern CSS coverage** — Media queries, container queries, `@supports`, `:has()`, `@starting-style`, `@property`, `@keyframes`, etc. Some features that don't fit Tasty's component model (such as `@layer` and `!important`) are intentionally omitted, but real-world use cases are covered almost completely.
- **Runtime or zero-runtime — your call** — Use `tasty()` for dynamic React components with runtime injection, or `tastyStatic()` with the Babel plugin for zero-runtime CSS extraction. Same DSL, same tokens, same output.
- **Only generate what is used** — In runtime mode, Tasty injects CSS on demand for mounted components/variants, so your app avoids shipping style rules for UI states that are never rendered.
- **Runtime performance that holds at scale** — The runtime path is tested against enterprise-scale applications and tuned with multi-level caching, chunk-level style reuse, style garbage collection, and a dedicated injector.
- **Composable and extensible by design** — Extend any component's styles with proper merge semantics, and evolve built-in behavior through configuration and plugins.
- **TypeScript-first** — Full type definitions, module augmentation for custom properties, and autocomplete for tokens, presets, and themes.

## Installation

```bash
pnpm add @tenphi/tasty
```

## Quick Start

### Create a styled component

```tsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    flow: 'column',
    padding: '4x',
    gap: '2x',
    fill: '#surface',
    border: '#border bottom',
    radius: '1r',
  },
});

// Just a React component
<Card>Hello World</Card>
```

Every value maps to CSS you'd recognize — but with tokens and units that keep your design system consistent by default.

### Add state-driven styles

```tsx
const Button = tasty({
  as: 'button',
  styles: {
    padding: '1.5x 3x',
    fill: {
      '': '#primary',
      ':hover': '#primary-hover',
      ':active': '#primary-pressed',
      '[disabled]': '#surface',
    },
    color: {
      '': '#on-primary',
      '[disabled]': '#text.40',
    },
    cursor: {
      '': 'pointer',
      '[disabled]': 'not-allowed',
    },
    transition: 'theme',
  },
});
```

State keys support pseudo-classes first (`:hover`, `:active`), then modifiers (`theme=danger`), attributes (`[disabled]`), media/container queries, root states, and more. Tasty compiles them into exclusive selectors automatically.

### Extend any component

```tsx
import { Button } from 'my-ui-lib';

const DangerButton = tasty(Button, {
  styles: {
    fill: {
      '': '#danger',
      ':hover': '#danger-hover',
    },
  },
});
```

Child styles merge with parent styles intelligently — state maps can extend or replace parent states per-property.

### Configure once, use everywhere

```tsx
import { configure } from '@tenphi/tasty';

configure({
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(w < 1024px)',
    '@dark': '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
  },
  recipes: {
    card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
  },
});
```

Predefined states turn complex selector logic into single tokens. Use `@mobile` instead of writing media query expressions in every component.

## How It Actually Works

This is the core idea that makes everything else possible.

Traditional CSS has two structural problems.

First, the **cascade** resolves conflicts by specificity and source order: when multiple selectors match, the one with the highest specificity wins, or — if specificity is equal — the last one in source order wins. That makes styles inherently fragile. Reordering imports, adding a media query, or composing components from different libraries can silently break styling.

Second, **authoring selectors that capture real-world state logic is fundamentally hard.** A single state like "dark mode" may depend on a root attribute, an OS preference, or both — each branch needing its own selector, proper negation of competing branches, and correct `@media` nesting. The example below shows the CSS you'd write by hand for just *one* property with *one* state. Scale that across dozens of properties, then add breakpoints and container queries, and the selector logic quickly becomes unmanageable.

Tasty solves both problems at once: **every state mapping compiles into mutually exclusive selectors.**

```tsx
const Text = tasty({
  styles: {
    color: {
      '': '#text',
      '@dark': '#text-on-dark',
    },
    padding: {
      '': '4x',
      '@mobile': '2x',
    },
  },
});
```

If `@dark` expands to `@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))`, Tasty generates:

```css
/* Branch 1: Explicit dark schema */
:root[data-schema="dark"] .t0.t0 {
  color: var(--text-on-dark-color);
}

/* Branch 2: No schema attribute + OS prefers dark */
@media (prefers-color-scheme: dark) {
  :root:not([data-schema]) .t0.t0 {
    color: var(--text-on-dark-color);
  }
}

/* Default: no schema + OS does not prefer dark */
@media (not (prefers-color-scheme: dark)) {
  :root:not([data-schema="dark"]) .t0.t0 {
    color: var(--text-color);
  }
}

/* Default: schema is set but not dark (any OS preference) */
:root:not([data-schema="dark"])[data-schema] .t0.t0 {
  color: var(--text-color);
}
```

Every rule is guarded by the negation of higher-priority rules. No two rules can match at the same time. No specificity arithmetic. No source-order dependence. Components compose and extend without collisions.

By absorbing selector complexity, Tasty makes advanced CSS patterns practical again — nested container queries, multi-condition `@supports` gates, and combined root-state/media branches. You stay in pure CSS instead of relying on JavaScript workarounds, so the browser can optimize layout, painting, and transitions natively. Tasty doesn't limit CSS; it unlocks its full potential by removing the complexity that held teams back.

## Capabilities

### Design Tokens and Custom Units

Tokens are first-class. Colors use `#name` syntax. Spacing, radius, and border width use multiplier units tied to CSS custom properties:

```tsx
fill: '#surface',         // → var(--surface-color)
color: '#text.80',        // → 80% opacity text token
padding: '2x',            // → calc(var(--gap) * 2)
radius: '1r',             // → var(--radius)
border: '1bw solid #border',
```

| Unit | Maps to | Example |
|------|---------|---------|
| `x` | `--gap` multiplier | `2x` → `calc(var(--gap) * 2)` |
| `r` | `--radius` multiplier | `1r` → `var(--radius)` |
| `bw` | `--border-width` multiplier | `1bw` → `var(--border-width)` |
| `ow` | `--outline-width` multiplier | `1ow` → `var(--outline-width)` |
| `cr` | `--card-radius` multiplier | `1cr` → `var(--card-radius)` |

Define your own units via `configure({ units: { ... } })`.

### State System

Every style property accepts a state mapping object. Keys can be combined with boolean logic:

| State type | Syntax | CSS output |
|------------|--------|------------|
| Data attribute (boolean modifier) | `disabled` | `[data-disabled]` |
| Data attribute (value modifier) | `theme=danger` | `[data-theme="danger"]` |
| Pseudo-class | `:hover` | `:hover` |
| Attribute selector | `[role="tab"]` | `[role="tab"]` |
| Class selector (supported) | `.is-active` | `.is-active` |
| Media query | `@media(w < 768px)` | `@media (width < 768px)` |
| Container query | `@(panel, w >= 300px)` | `@container panel (width >= 300px)` |
| Root state | `@root(theme=dark)` | `:root[data-theme="dark"]` |
| Parent state | `@parent(theme=danger)` | `:is([data-theme="danger"] *)` |
| Feature query | `@supports(display: grid)` | `@supports (display: grid)` |
| Entry animation | `@starting` | `@starting-style` |

Combine with `&` (AND), `|` (OR), `!` (NOT):

```tsx
fill: {
  '': '#surface',
  'theme=danger & :hover': '#danger-hover',
  '[aria-selected="true"]': '#accent-subtle',
}
```

### Sub-Element Styling

Style inner elements from the parent component definition. No extra components, no CSS leakage:

```tsx
const Card = tasty({
  styles: {
    padding: '4x',
    Title: { preset: 'h3', color: '#primary' },
    Content: { color: '#text', preset: 't2' },
  },
  elements: { Title: 'h2', Content: 'div' },
});

<Card>
  <Card.Title>Heading</Card.Title>
  <Card.Content>Body text</Card.Content>
</Card>
```

Sub-elements use `data-element` attributes — no extra class names, no naming conventions.

By default, sub-elements participate in the same state context as the root component. That means mappings like `:hover`, `theme=danger`, `[role="button"]`, and other keys are evaluated as one unified block, which keeps styling logic predictable across the whole markup tree.

Use `@own(...)` when a sub-element should react to its own state instead of the root state context.

Class selectors are also supported, but modifiers/pseudo-classes are usually the better default in design-system code.

Use the sub-element selector `$` when you need precise descendant targeting to avoid leakage in deeply nested component trees.

### Variants

Variants are designed to keep single-component CSS lean. Instead of generating dozens of static button classes up front, define all versions once and let runtime usage decide what CSS is actually emitted.

```tsx
const Button = tasty({
  styles: { padding: '2x 4x', radius: '1r' },
  variants: {
    default: { fill: '#primary', color: '#on-primary' },
    danger: { fill: '#danger', color: '#on-danger' },
    outline: { fill: 'transparent', border: '1bw solid #primary' },
  },
});

<Button variant="danger">Delete</Button>
```

### Recipes

Recipes are predefined style sets that work like composable styling classes for Tasty. They can be pre-applied or post-applied to current styles, which lets you add reusable state logic while still allowing local style overrides.

```tsx
configure({
  recipes: {
    card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
    elevated: { shadow: '0 2x 4x #shadow' },
  },
});

const ProfileCard = tasty({
  styles: {
    recipe: 'card elevated',
    color: '#text',
  },
});
```

Use `/` to post-apply recipes after local styles when you need recipe states/styles to win the final merge order. Use `none` to skip base recipes: `recipe: 'none / disabled'`.

### Keyframes and `@property`

Modern CSS features are natively supported:

Custom property types (`<color>`, `<number>`, `<length>`, `<angle>`, `<percentage>`, `<time>`) are automatically inferred from values and registered as CSS `@property` declarations — no manual setup needed:

```tsx
const Pulse = tasty({
  styles: {
    animation: 'pulse 2s infinite',
    transform: 'scale($pulse-scale)',
    '@keyframes': {
      pulse: {
        '0%, 100%': { '$pulse-scale': 1 },
        '50%': { '$pulse-scale': 1.05 },
      },
    },
  },
});
```

The `$pulse-scale: 1` declaration is detected as `<number>` and a `@property --pulse-scale` rule is injected automatically. This also works for `var()` chains — if `$a` references `var(--b)`, the type propagates once `--b` is resolved.

Use explicit `@properties` only when you need non-default settings (e.g. `inherits: false`):

```tsx
'@properties': {
  '$pulse-scale': { syntax: '<number>', inherits: false, initialValue: 1 },
},
```

Disable auto-inference globally with `configure({ autoPropertyTypes: false })`.

### React Hooks

For cases where you don't need a full component:

```tsx
import { useStyles, useGlobalStyles, useRawCSS } from '@tenphi/tasty';

function App() {
  const { className } = useStyles({ padding: '2x', fill: '#surface' });
  useGlobalStyles(':root', { '#primary': 'purple', '$gap': '8px' });
  useRawCSS('body { margin: 0; }');

  return <main className={className}>...</main>;
}
```

### Zero-Runtime Mode

Extract all CSS at build time. Zero JavaScript overhead in production:

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

const card = tastyStatic({
  padding: '4x',
  fill: '#surface',
  radius: '1r',
  color: { '': '#text', '@dark': '#text-on-dark' },
});

// card is a CSS class name string
<div className={card}>Static styles, zero runtime</div>
```

Configure the Babel plugin:

```js
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', {
      output: 'public/tasty.css',
      config: {
        states: { '@dark': '@root(theme=dark)' },
      },
    }],
  ],
};
```

### `tasty` vs `tastyStatic`

| | `tasty` (runtime) | `tastyStatic` (zero-runtime) |
|---|---|---|
| **Output** | React component | CSS class name |
| **CSS injection** | Runtime `<style>` tags | Build-time extraction |
| **Runtime cost** | Style generation on mount | None |
| **Generated CSS scope** | Only styles/variants used at runtime | All extracted static styles at build time |
| **Dynamic values** | Fully supported | Via CSS custom properties |
| **Sub-elements** | Built-in (`<C.Title>`) | Manual (`data-element`) |
| **Variants** | Built-in (`variants` option) | Separate static styles |
| **Framework** | React | Any (requires Babel) |
| **Best for** | Interactive apps, design systems | Static sites, SSG, landing pages |

Both share the same DSL, tokens, units, state mappings, and recipes.

### Runtime Performance

If you choose the runtime approach, performance is usually a non-issue in practice:

- CSS is generated and injected only when styles are actually used.
- Multi-level caching avoids repeated parsing and style recomputation.
- Styles are split into reusable chunks and applied as multiple class names, so matching chunks can be reused across components instead of re-injected.
- Style normalization guarantees equivalent style input resolves to the same chunks, improving deduplication hit rates.
- A style garbage collector removes unused styles/chunks over time.
- A dedicated style injector minimizes DOM/style-tag overhead.
- This approach is validated in enterprise-scale apps where runtime styling overhead is not noticeable in normal UI flows.

## Entry Points

| Import | Description | Platform |
|--------|-------------|----------|
| `@tenphi/tasty` | Runtime style engine (`tasty`, hooks, `configure`) | Browser |
| `@tenphi/tasty/static` | Zero-runtime static styles (`tastyStatic`) | Browser |
| `@tenphi/tasty/core` | Lower-level internals (config, parser, pipeline, injector, style handlers) for tooling and advanced use | Browser / Node |
| `@tenphi/tasty/babel-plugin` | Babel plugin for zero-runtime CSS extraction | Node |
| `@tenphi/tasty/zero` | Programmatic extraction API | Node |
| `@tenphi/tasty/next` | Next.js integration wrapper | Node |

## Ecosystem

Tasty is the core of a production-ready styling platform. These companion tools complete the picture:

### [ESLint Plugin](https://github.com/tenphi/eslint-plugin-tasty)

`@tenphi/eslint-plugin-tasty` — 27 lint rules that validate style property names, value syntax, token existence, state keys, and enforce best practices. Catch typos and invalid styles at lint time, not at runtime.

```bash
pnpm add -D @tenphi/eslint-plugin-tasty
```

```js
import tasty from '@tenphi/eslint-plugin-tasty';
export default [tasty.configs.recommended];
```

### [Glaze](https://github.com/tenphi/glaze)

`@tenphi/glaze` — OKHSL-based color theme generator with automatic WCAG contrast solving. Generate light, dark, and high-contrast palettes from a single hue, and export them directly as Tasty color tokens.

```tsx
import { glaze } from '@tenphi/glaze';

const theme = glaze(280, 80);
theme.colors({
  surface: { lightness: 97 },
  text: { base: 'surface', lightness: '-52', contrast: 'AAA' },
});

const tokens = theme.tasty(); // Ready-to-use Tasty tokens
```

### [VS Code Extension](https://github.com/tenphi/tasty-vscode-extension)

Syntax highlighting for Tasty styles in TypeScript, TSX, JavaScript, and JSX. Highlights color tokens, custom units, state keys, presets, and style properties inside `tasty()`, `tastyStatic()`, and related APIs.

<p align="center">
  <img src="assets/tasty-vscode-highlight.png" width="512" alt="Tasty VS Code syntax highlighting example">
</p>

### [Cube UI Kit](https://github.com/cube-js/cube-ui-kit)

Open-source React UI kit built on Tasty + React Aria. 100+ production components proving Tasty works at design-system scale. A reference implementation and a ready-to-use component library.

## Documentation

- **[Usage Guide](docs/usage.md)** — Runtime styling: component creation, state mappings, sub-elements, variants, and hooks
- **[Configuration](docs/configuration.md)** — Global configuration: tokens, recipes, custom units, style handlers, and TypeScript extensions
- **[Style Properties](docs/styles.md)** — Complete reference for all enhanced style properties: syntax, values, modifiers, and recommendations
- **[Zero Runtime (tastyStatic)](docs/tasty-static.md)** — Build-time static styling: Babel plugin setup, Next.js integration, and static style patterns
- **[Style Injector](docs/injector.md)** — Internal CSS injection engine: `inject()`, `injectGlobal()`, `injectRawCSS()`, `keyframes()`, deduplication, reference counting, cleanup, SSR support, and Shadow DOM
- **[Debug Utilities](docs/debug.md)** — Runtime CSS inspection via `tastyDebug`: CSS extraction, element inspection, cache metrics, chunk breakdown, and performance monitoring

## License

[MIT](LICENSE)
