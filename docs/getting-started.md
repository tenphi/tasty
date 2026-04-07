# Getting Started

This guide walks you from zero to a working Tasty component, then through the optional shared configuration and tooling layers. It is the right starting point when you already want to try Tasty in code. If you are still deciding whether Tasty fits your team, start with [Comparison](comparison.md) and [Adoption Guide](adoption.md) first. For a feature overview, see the [README](../README.md). For the full style language reference, see the [Style DSL](dsl.md). For the React API, see the [Runtime API](runtime.md). For the rest of the docs by role or task, see the [Docs Hub](README.md).

---

## Prerequisites

- **Node.js** >= 20
- **React** >= 18 (peer dependency)
- **Package manager**: pnpm, npm, or yarn

Tasty can be used immediately in a React app, but it is most compelling for teams building reusable components with intersecting states, variants, tokens, and design-system conventions.

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

## Optional: add shared configuration

Use `configure()` once, before your app renders, when your app or design system needs shared state aliases, tokens, recipes, or parser extensions:

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

These examples use `data-schema="dark"` as the root-state convention. If your app already uses a different attribute such as `data-theme="dark"`, keep the pattern and swap the attribute name consistently across your config and components.

Import this file at the top of your app entry point so it runs before any component renders:

```tsx
// src/main.tsx
import './tasty-config';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

### Define shared tokens and override default unit values

Color tokens like `#primary` resolve to CSS custom properties at runtime (e.g. `var(--primary-color)`). Built-in units like `x`, `r`, and `bw` already work without setup and multiply CSS custom properties by default. Use `configure({ tokens })` when you want to define shared token values or override the defaults your app uses:

```tsx
// src/tasty-config.ts
import { configure } from '@tenphi/tasty';

configure({
  tokens: {
    '#primary': 'oklch(55% 0.25 265)',
    '#surface': '#fff',
    '#text': '#111',
    '$gap': '8px',
    '$radius': '4px',
    '$border-width': '1px',
    '$outline-width': '2px',
  },
});
```

Tokens support state maps for responsive or theme-aware values:

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

Every component using `#primary`, `2x`, or `1r` adjusts automatically. Tokens are injected as `:root` CSS custom properties when the first style is rendered. You can also use standard CSS color values such as `rgb(...)`, `hsl(...)`, and named colors directly; `okhsl(...)` is the recommended choice when you want authored colors that stay aligned with Tasty's design-system-oriented workflow.

> **Note:** `configure({ replaceTokens })` is a separate mechanism — it replaces tokens with literal values at parse time (baked into CSS). Use it for value aliases like `$card-padding: '4x'` that should be resolved during style generation, not for defining color or unit values. See [Configuration — Replace Tokens](configuration.md#replace-tokens-parse-time-substitution) for details.

See [Configuration](configuration.md) for the full `configure()` API — tokens, replace tokens, recipes, custom units, style handlers, and TypeScript extensions.

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

The `recommended` config enables 18 of the plugin's 27 total rules. It covers the most common issues without turning on the stricter governance rules:

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

Tasty has two styling approaches. Pick the one that fits your use case, then decide whether your runtime setup also needs server rendering support:

| Approach | Entry point | Best for | Trade-off |
|------|-------------|----------|-----------|
| **Runtime** | `tasty()` from `@tenphi/tasty` | Interactive apps with reusable stateful components, design systems | CSS generated at runtime; full feature set (styleProps, sub-elements, variants) |
| **Zero-runtime** | `tastyStatic()` from `@tenphi/tasty/static` | Static sites, landing pages, SSG | Zero JS overhead; requires Babel plugin; no dynamic props |

Both share the same DSL, tokens, units, and state mappings.

- Runtime is the default and requires no extra setup beyond `@tenphi/tasty`.
- If your framework can execute runtime code during server rendering, add SSR support on top of runtime with `@tenphi/tasty/ssr/next`, `@tenphi/tasty/ssr/astro`, or the core SSR API. This still uses `tasty()`; it just collects CSS on the server and hydrates the cache on the client.
- Zero-runtime requires the Babel plugin and additional peer dependencies. See [Zero Runtime (tastyStatic)](tasty-static.md).
- SSR works with existing `tasty()` components — wrap your app with a registry, middleware, or collector. See [Server-Side Rendering](ssr.md).

---

## Next steps

- **[Docs Hub](README.md)** — Pick the next guide by role, styling approach, or task
- **[Methodology](methodology.md)** — The recommended patterns for structuring Tasty components: sub-elements, styleProps, tokens, extension
- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[Runtime API](runtime.md)** — `tasty()` factory, component props, variants, sub-elements, style functions
- **[Building a Design System](design-system.md)** — Practical guide to building a DS layer with Tasty: tokens, recipes, primitives, compound components
- **[Adoption Guide](adoption.md)** — Roll out Tasty inside an existing design system or platform team
- **[Comparison](comparison.md)** — Evaluate Tasty against other styling systems
- **[Configuration](configuration.md)** — Full `configure()` API: tokens, recipes, custom units, style handlers, TypeScript extensions
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
- **[Debug Utilities](debug.md)** — Inspect generated CSS and debug runtime behavior when styles do not look right

---

## Common issues

- Styles are missing on first render: make sure the file that calls `configure()` is imported before any `tasty()` component renders.
- Token or unit values are not what you expect: check your `configure({ tokens, units })` setup, then inspect the generated CSS variables with [Debug Utilities](debug.md).
- You need build-time extraction or server-rendered CSS delivery: use [Zero Runtime (tastyStatic)](tasty-static.md) for extraction, or add [Server-Side Rendering](ssr.md) on top of runtime `tasty()` when your framework renders on the server.
