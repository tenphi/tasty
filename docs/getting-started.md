# Getting Started

This guide walks you from zero to a working Tasty setup with tooling. For a feature overview, see the [README](../README.md). For the full style language reference, see the [Style DSL](dsl.md). For the React API, see the [Runtime API](runtime.md).

---

## Prerequisites

- **Node.js** >= 20
- **React** >= 18 (peer dependency)
- **Package manager**: pnpm, npm, or yarn

---

## Install

```bash
pnpm add @tenphi/tasty
```

---

## Your first component

```tsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    flow: 'column',
    padding: '4x',
    gap: '2x',
    fill: '#white',
    border: true,
    radius: true,
  },
});

export default function App() {
  return <Card>Hello, Tasty!</Card>;
}
```

`tasty()` returns a normal React component. Values like `4x`, `#white`, `true`, and `1r` are Tasty DSL — they map to CSS custom properties, shorthand expansions, and design tokens. See [Style Properties](styles.md) for the full reference.

---

## Add configuration

Call `configure()` once, before your app renders, to define state aliases and other conventions your components share:

```tsx
// src/tasty-config.ts
import { configure } from '@tenphi/tasty';

configure({
  states: {
    '@mobile': '@media(w < 768px)',
    '@dark': '@root(schema=dark)',
  },
});
```

Import this file at the top of your app entry point so it runs before any component renders:

```tsx
// src/main.tsx
import './tasty-config';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

### Define design tokens and unit values

Color tokens like `#primary` resolve to CSS custom properties at runtime (e.g. `var(--primary-color)`). Built-in units like `x`, `r`, and `bw` also multiply CSS custom properties. Define all of them on `:root` using `useGlobalStyles`:

```tsx
// src/DesignTokens.tsx
import { useGlobalStyles } from '@tenphi/tasty';

export function DesignTokens() {
  useGlobalStyles(':root', {
    // Color tokens — #primary in styles → var(--primary-color)
    '#primary': 'oklch(55% 0.25 265)',
    '#surface': '#fff',
    '#text': '#111',

    // Unit values — 2x → calc(var(--gap) * 2)
    '$gap': '8px',
    '$radius': '4px',
    '$border-width': '1px',
    '$outline-width': '2px',
  });

  return null;
}
```

Render `<DesignTokens />` near the root of your app. Every component using `#primary`, `2x`, or `1r` adjusts automatically.

> **Note:** `configure({ tokens })` is a different mechanism — it replaces tokens with literal values at parse time (baked into CSS). Use it for value aliases like `$card-padding: '4x'` that should be resolved during style generation, not for defining color or unit values. See [Configuration — Predefined Tokens](configuration.md#predefined-tokens) for details.

See [Configuration](configuration.md) for the full `configure()` API — predefined tokens, recipes, custom units, style handlers, and TypeScript extensions.

---

## ESLint plugin

The ESLint plugin catches invalid style properties, bad token references, malformed state keys, and other mistakes at lint time — before they reach the browser.

### Install

```bash
pnpm add -D @tenphi/eslint-plugin-tasty
```

### Configure

Add the plugin to your flat config:

```js
// eslint.config.js
import tasty from '@tenphi/eslint-plugin-tasty';

export default [
  // ...your other configs
  tasty.configs.recommended,
];
```

### What `recommended` catches

The recommended config enables 18 rules covering the most common issues:

| Category | Rules | Examples |
|----------|-------|---------|
| Property validation | `known-property`, `valid-boolean-property`, `valid-sub-element` | Flags typos like `pading` or invalid boolean usage |
| Value validation | `valid-value`, `valid-color-token`, `valid-custom-unit` | Catches `#nonexistent` tokens, bad unit syntax |
| State validation | `valid-state-key`, `no-nested-state-map`, `require-default-state` | Validates state key syntax, ensures `''` default exists |
| Structure | `valid-styles-structure`, `no-important`, `no-nested-selector` | Prevents `!important`, invalid nesting |
| Static mode | `static-no-dynamic-values`, `static-valid-selector` | Enforces build-time constraints in `tastyStatic()` |
| Style properties | `valid-preset`, `valid-recipe`, `valid-transition`, `valid-directional-modifier`, `valid-radius-shape` | Validates preset names, recipe references, transition syntax |

### Strict config

For stricter governance, use `tasty.configs.strict`. It adds rules that enforce best practices like preferring shorthand properties, consistent token usage, and flagging direct `styles` prop usage:

```js
export default [
  tasty.configs.strict,
];
```

---

## Editor support

**[VS Code Extension](https://github.com/tenphi/tasty-vscode-extension)** — Syntax highlighting for Tasty styles in TypeScript/TSX/JavaScript/JSX. Highlights color tokens, custom units, state keys, presets, and style properties inside `tasty()` and `tastyStatic()` calls. Install from the VS Code marketplace or from a `.vsix` file.

**[Glaze](https://github.com/tenphi/glaze)** — OKHSL-based color theme generator with automatic WCAG contrast solving. Generate light, dark, and high-contrast color palettes from a single hue and export them directly as Tasty color tokens. See the [Ecosystem section](../README.md#ecosystem) in the README.

---

## Choosing a rendering mode

Tasty supports three rendering modes. Pick the one that fits your use case:

| Mode | Entry point | Best for | Trade-off |
|------|-------------|----------|-----------|
| **Runtime** | `tasty()` from `@tenphi/tasty` | Interactive apps, design systems | CSS generated at runtime; full feature set (styleProps, sub-elements, variants) |
| **Zero-runtime** | `tastyStatic()` from `@tenphi/tasty/static` | Static sites, landing pages, SSG | Zero JS overhead; requires Babel plugin; no dynamic props |
| **SSR** | `@tenphi/tasty/ssr/next` or `@tenphi/tasty/ssr/astro` | Next.js, Astro, streaming SSR | Runtime `tasty()` with server-rendered CSS and zero-cost hydration |

All three share the same DSL, tokens, units, and state mappings.

- Runtime is the default and requires no extra setup beyond `@tenphi/tasty`.
- Zero-runtime requires the Babel plugin and additional peer dependencies. See [Zero Runtime (tastyStatic)](tasty-static.md).
- SSR works with existing `tasty()` components — wrap your app with a registry or middleware. See [Server-Side Rendering](ssr.md).

---

## Next steps

- **[Methodology](methodology.md)** — The recommended patterns for structuring Tasty components: sub-elements, styleProps, tokens, extension
- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[Runtime API](runtime.md)** — `tasty()` factory, component props, variants, sub-elements, hooks
- **[Building a Design System](design-system.md)** — Practical guide to building a DS layer with Tasty: tokens, recipes, primitives, compound components
- **[Configuration](configuration.md)** — Full `configure()` API: tokens, recipes, custom units, style handlers, TypeScript extensions
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
