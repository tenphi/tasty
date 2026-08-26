# Getting Started

Build one stateful component first. You will see how Tasty expresses priority as a state map, why overlapping states do not compete, and where shared design-system configuration fits afterward.

This is the right starting point when you are ready to try Tasty in code. If you are still evaluating it, read the [Introduction](../README.md), [Comparison](comparison.md), and [Adoption Guide](adoption.md).

---

## Prerequisites

- **Node.js** >= 20
- **React** >= 18 (peer dependency)
- **Package manager**: pnpm, npm, or yarn

No Tasty configuration is required for the first component.

---

## Install

```bash
pnpm add @tenphi/tasty
```

---

## Build a button whose states don’t fight

```tsx
import { tasty } from '@tenphi/tasty';

const Button = tasty({
  as: 'button',
  styles: {
    padding: '12px 20px',
    radius: '8px',
    border: '0',
    fill: {
      '': 'royalblue',
      ':hover': 'blue',
      ':active': 'navy',
      disabled: 'lightgray',
    },
    color: {
      '': 'white',
      disabled: 'dimgray',
    },
    cursor: {
      '': 'pointer',
      disabled: 'not-allowed',
    },
  },
});

export default function App() {
  return (
    <>
      <Button>Save changes</Button>
      <Button disabled>Disabled</Button>
    </>
  );
}
```

`tasty()` returns a normal React component. The keys in each state map define priority: later branches win over earlier ones. Because `disabled` is last, a disabled button keeps its disabled styles even while the pointer is over it.

`disabled` and `checked` are built-in automatic states. Tasty activates them from the corresponding native prop or attribute, so `disabled` is the concise Tasty form of `[disabled]`, and `checked` is the concise form of `[checked]`.

Tasty compiles that priority into selectors that exclude one another. The hover, active, and disabled background rules cannot all match and ask the CSS cascade to decide the winner.

The example uses ordinary CSS values so it works without setup. A design system will usually replace them with shared tokens, units, and state aliases in the next step. See the [Style DSL](dsl.md) for the complete state-map syntax and [Style Properties](styles.md) for Tasty’s enhanced CSS properties.

---

## Add your design system’s language

The first component needs no configuration. Use `configure()` once, before your app renders, when your app or design system is ready to share tokens, state aliases, recipes, units, or parser extensions:

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
    $gap: '8px',
    $radius: '4px',
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

| Category            | Rules                                                                                                  | Examples                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Property validation | `known-property`, `valid-boolean-property`, `valid-sub-element`                                        | Flags typos like `pading` or invalid boolean usage           |
| Value validation    | `valid-value`, `valid-color-token`, `valid-custom-unit`                                                | Catches `#nonexistent` tokens, bad unit syntax               |
| State validation    | `valid-state-key`, `no-nested-state-map`, `require-default-state`                                      | Validates state key syntax, ensures `''` default exists      |
| Structure           | `valid-styles-structure`, `no-important`, `no-nested-selector`                                         | Prevents `!important`, invalid nesting                       |
| Static mode         | `static-no-dynamic-values`, `static-valid-selector`                                                    | Enforces build-time constraints in `tastyStatic()`           |
| Style properties    | `valid-preset`, `valid-recipe`, `valid-transition`, `valid-directional-modifier`, `valid-radius-shape` | Validates preset names, recipe references, transition syntax |

### Strict config

For stricter governance, use `tasty.configs.strict`. It adds rules that enforce best practices like preferring shorthand properties, consistent token usage, and flagging direct `styles` prop usage:

```js
export default [tasty.configs.strict];
```

---

## Editor support

**[VS Code Extension](https://github.com/tenphi/tasty-vscode-extension)** — Syntax highlighting for Tasty styles in TypeScript/TSX/JavaScript/JSX. Highlights color tokens, custom units, state keys, presets, and style properties inside `tasty()` and `tastyStatic()` calls. Install from the VS Code marketplace or from a `.vsix` file.

**[Glaze](https://github.com/tenphi/glaze)** — OKHSL-based color theme generator with automatic WCAG contrast solving. Generate light, dark, and high-contrast color palettes from a single hue and export them directly as Tasty color tokens. See the [Ecosystem section](../README.md#ecosystem) in the README.

---

## Choosing a rendering mode

`tasty()` is the default for all React apps. All `tasty()` components and style functions are hook-free and work as React Server Components without `'use client'`. Zero-runtime delivery is not tied to one API: both server-only `tasty()` and build-time `tastyStatic()` can ship no Tasty styling runtime to the browser.

| Approach                  | Authoring API                               | CSS is generated                    | Tasty runtime in the browser | Best for                                                         |
| ------------------------- | ------------------------------------------- | ----------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| **Server-only React**     | `tasty()`; optional `@tenphi/tasty/ssr/*`   | During server or static rendering   | None                         | Astro without islands, server-only RSC, SSG                      |
| **Hydrated React**        | `tasty()` plus `@tenphi/tasty/ssr/*`        | During SSR, then on demand in React | Only in hydrated components  | Interactive React apps, Next.js client components, Astro islands |
| **Build-time extraction** | `tastyStatic()` from `@tenphi/tasty/static` | During the build                    | None in file mode            | Non-React frameworks or extraction before rendering              |

Both `tasty()` and `tastyStatic()` share the same DSL, tokens, units, and state mappings.

- **Server-only `tasty()`** keeps the full feature set (`styleProps`, sub-elements, variants) while generating CSS during server rendering. `tasty()` plus `tastyIntegration({ islands: false })` in Astro is the verified concrete setup and ships no client JavaScript. The same server-only architecture applies to Next.js RSC; verify the generated output for your deployment.
- **Hydrated `tasty()`** uses the SSR integrations to batch and deduplicate server CSS, prevent FOUC, and hydrate the client cache. The browser styling pipeline is available only where React components hydrate. See [Server-Side Rendering](ssr.md).
- **Build-time extraction** uses the Babel plugin and additional peer dependencies. Choose `tastyStatic()` when CSS must be generated before rendering or when the consumer is not React. File mode ships no styling runtime; inject mode intentionally includes a tiny CSS injector. See [Build-Time Extraction (`tastyStatic`)](tasty-static.md).

---

## Next steps

- **[Docs Hub](README.md)** — Pick the next guide by role, styling approach, or task
- **[Methodology](methodology.md)** — The recommended patterns for structuring Tasty components: sub-elements, styleProps, tokens, extension
- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[React API](react-api.md)** — `tasty()` factory, component props, variants, sub-elements, style functions
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
- You need zero-runtime delivery: use server-only [`tasty()` with server rendering](ssr.md) to keep the full React API, or use [`tastyStatic()` build-time extraction](tasty-static.md) when styles must be compiled before rendering.
