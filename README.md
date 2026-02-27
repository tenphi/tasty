<p align="center">
  <img src="assets/tasty.svg" width="128" height="128" alt="Tasty logo">
</p>

<h1 align="center">Tasty</h1>

<p align="center">
  A design-system-integrated styling system and DSL for concise, state-aware UI styling
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tenphi/tasty"><img src="https://img.shields.io/npm/v/@tenphi/tasty.svg" alt="npm version"></a>
  <a href="https://github.com/tenphi/tasty/actions/workflows/ci.yml"><img src="https://github.com/tenphi/tasty/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://github.com/tenphi/tasty/blob/main/LICENSE"><img src="https://img.shields.io/github/license/tenphi/tasty" alt="license"></a>
</p>

---

Tasty is a powerful CSS-in-JS styling system for React that combines declarative state-aware styling with design system integration. It provides a concise DSL for creating maintainable, themeable components with built-in support for responsive design, dark mode, container queries, and more.

## Features

- **Declarative state-aware styling** — style objects with state keys (`hovered`, `disabled`, `@media`, `@root`, etc.)
- **Design token integration** — color tokens (`#purple`), custom units (`2x`, `1r`), typography presets
- **Sub-element styling** — style inner elements via capitalized keys with `data-element` attributes
- **Advanced state mapping** — media queries, container queries, root states, supports queries with boolean logic
- **Zero-runtime mode** — Babel plugin extracts CSS at build time for static sites
- **Plugin system** — extensible with custom color functions (OKHSL, etc.)
- **React hooks** — `useStyles`, `useGlobalStyles`, `useRawCSS` for programmatic style injection
- **Style extension** — compose and extend styled components with proper merge semantics
- **Recipes** — named style bundles for reusable patterns
- **TypeScript-first** — full type definitions with module augmentation support
- **Tree-shakeable ESM** — unbundled output with `sideEffects: false`

## Installation

```bash
pnpm add @tenphi/tasty
```

```bash
npm install @tenphi/tasty
```

```bash
yarn add @tenphi/tasty
```

## Quick Start

### Creating Styled Components

```tsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  as: 'div',
  styles: {
    padding: '4x',
    fill: '#white',
    border: true,
    radius: true,
  },
});

<Card>Hello World</Card>
```

### State-Based Styling

```tsx
const InteractiveCard = tasty({
  styles: {
    fill: {
      '': '#white',
      'hovered': '#gray.05',
      'pressed': '#gray.10',
      '@media(w < 768px)': '#surface',
    },
    padding: {
      '': '4x',
      '@media(w < 768px)': '2x',
    },
  },
});
```

### Extending Components

```tsx
import { Button } from 'my-ui-lib';

const PrimaryButton = tasty(Button, {
  styles: {
    fill: '#purple',
    color: '#white',
    padding: '2x 4x',
  },
});
```

### Configuration

```tsx
import { configure } from '@tenphi/tasty';

configure({
  states: {
    '@mobile': '@media(w < 768px)',
    '@dark': '@root(theme=dark)',
  },
  recipes: {
    card: {
      padding: '4x',
      fill: '#surface',
      radius: '1r',
      border: true,
    },
  },
});
```

## Entry Points

| Import | Description | Platform |
|--------|-------------|----------|
| `@tenphi/tasty` | Runtime style engine | Browser |
| `@tenphi/tasty/static` | Build-time static style generation | Browser |
| `@tenphi/tasty/babel-plugin` | Babel plugin for zero-runtime | Node |
| `@tenphi/tasty/zero` | Programmatic extraction API | Node |
| `@tenphi/tasty/next` | Next.js integration wrapper | Node |

## Core Concepts

### Design Tokens

```tsx
const TokenCard = tasty({
  styles: {
    fill: '#surface',        // Color token → var(--surface-color)
    color: '#text',          // Color token
    padding: '2x',           // Gap multiplier → calc(var(--gap) * 2)
    radius: '1r',            // Border radius → var(--radius)
    border: '1bw solid #border',
  },
});
```

### Sub-Element Styling

```tsx
const Card = tasty({
  styles: {
    padding: '4x',
    Title: { preset: 'h3', color: '#primary' },
    Content: { color: '#text' },
  },
  elements: {
    Title: 'h2',
    Content: 'div',
  },
});

<Card>
  <Card.Title>Title</Card.Title>
  <Card.Content>Content</Card.Content>
</Card>
```

### Hooks

```tsx
import { useStyles, useGlobalStyles } from '@tenphi/tasty';

function MyComponent() {
  const { className } = useStyles({
    padding: '2x',
    fill: '#surface',
  });

  useGlobalStyles('.card', {
    border: '1bw solid #border',
    radius: '1r',
  });

  return <div className={className}>Styled</div>;
}
```

### Zero-Runtime Mode

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  display: 'inline-flex',
  padding: '2x 4x',
  fill: '#purple',
  color: '#white',
});

<button className={button}>Click me</button>
```

Configure the Babel plugin:

```js
// babel.config.js
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', { output: 'public/tasty.css' }],
  ],
};
```

## Built-in Units

| Unit | Description | Example | CSS Output |
|------|-------------|---------|------------|
| `x` | Gap multiplier | `2x` | `calc(var(--gap) * 2)` |
| `r` | Border radius | `1r` | `var(--radius)` |
| `cr` | Card border radius | `1cr` | `var(--card-radius)` |
| `bw` | Border width | `2bw` | `calc(var(--border-width) * 2)` |
| `ow` | Outline width | `1ow` | `var(--outline-width)` |
| `fs` | Font size | `1fs` | `var(--font-size)` |
| `lh` | Line height | `1lh` | `var(--line-height)` |
| `sf` | Stable fraction | `1sf` | `minmax(0, 1fr)` |

## `tasty` vs `tastyStatic`

Tasty ships two styling APIs with different trade-offs. Pick the one that fits your project:

| | `tasty` (runtime) | `tastyStatic` (zero-runtime) |
|---|---|---|
| **Framework** | React only | Framework-agnostic (requires Babel) |
| **Import** | `@tenphi/tasty` | `@tenphi/tasty/static` |
| **Output** | React component | CSS class name (string) |
| **CSS injection** | At runtime via `<style>` tags | At build time via Babel plugin |
| **Runtime overhead** | Style generation + injection on mount | None — CSS is pre-extracted |
| **Requires Babel plugin** | No | Yes (`@tenphi/tasty/babel-plugin`) |
| **Component creation** | `tasty({ as, styles, ... })` | `tastyStatic({ ... })` returns a class |
| **Extending components** | `tasty(BaseComponent, { styles })` | `tastyStatic(baseStyle, { ... })` |
| **Global / selector styles** | `useGlobalStyles(selector, styles)` | `tastyStatic(selector, styles)` |
| **Style props at runtime** | Yes — `styleProps`, `styles`, `mods` | No — all values must be static |
| **Dynamic values** | Fully supported | Only via CSS custom properties |
| **Sub-elements** | Built-in (`elements` + `<C.Title>`) | Manual (use `data-element` + CSS) |
| **Variants** | Built-in (`variants` option) | Manual (create separate static styles) |
| **Tokens** | `tokens` prop → inline CSS vars | `processTokens()` helper |
| **Design tokens & units** | Full support (`#color`, `2x`, `1r`) | Full support (`#color`, `2x`, `1r`) |
| **State mappings** | Full support (modifiers, media, etc.) | Full support (modifiers, media, etc.) |
| **Recipes** | Supported via `configure()` | Supported via Babel plugin config |
| **Best for** | Interactive React apps, design systems | Static sites, landing pages, SSG |

## Documentation

- [Runtime API (tasty)](docs/tasty.md) — Full runtime styling documentation
- [Zero Runtime (tastyStatic)](docs/tasty-static.md) — Build-time static styling documentation

## License

[MIT](LICENSE)
