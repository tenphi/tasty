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

- **Deterministic at any scale** — Exclusive selector generation eliminates the entire class of cascade/specificity bugs. Every state combination resolves to exactly one CSS rule per property. Refactor freely. See [How It Actually Works](#how-it-actually-works).
- **AI-friendly by design** — Style definitions are declarative, self-contained, and structurally consistent. AI tools can read, understand, and refactor even advanced state bindings as confidently as a human — because there's no hidden cascade logic or implicit ordering to second-guess.
- **DSL that feels like CSS** — Property names you already know (`padding`, `color`, `display`) with syntax sugar that removes boilerplate. Learn the DSL in minutes, not days. Start with the [Style DSL](docs/dsl.md), then use [Style Properties](docs/styles.md) as the handler reference.
- **CSS properties as normal component props** — `styleProps` lets you expose selected styles as typed React props. Use `<Button placeSelf="end">` or `<Space flow="row" gap="2x">` without extra wrappers, utility classes, or `styles` overrides. The same props also accept state maps, so responsive values work with the same API. See [CSS properties as props](#css-properties-as-props).
- **Design-system native** — Color tokens (`#primary`), spacing units (`2x`), typography presets (`h1`, `t2`), border radius (`1r`), and recipes are first-class primitives, not afterthoughts. Built-in units and standard color values work out of the box, and [Configuration](docs/configuration.md) lets teams define shared conventions on top.
- **Near-complete modern CSS coverage** — Media queries, container queries, `@supports`, `:has()`, `@starting-style`, `@property`, `@keyframes`, etc. Some features that don't fit Tasty's component model (such as `@layer` and `!important`) are intentionally omitted, but real-world use cases are covered almost completely.
- **Runtime, zero-runtime, or SSR — your call** — Use `tasty()` for dynamic React components with runtime injection, `tastyStatic()` with the Babel plugin for zero-runtime CSS extraction, or enable SSR with zero-cost client hydration for Next.js, Astro, or any React framework. Same DSL, same tokens, same output.
- **Only generate what is used** — In runtime mode, Tasty injects CSS on demand for mounted components/variants, so your app avoids shipping style rules for UI states that are never rendered.
- **Runtime performance that holds at scale** — The runtime path is tested against enterprise-scale applications and tuned with multi-level caching, chunk-level style reuse, style garbage collection, and a dedicated injector.
- **Composable and extensible by design** — Extend any component's styles with proper merge semantics, and evolve built-in behavior through configuration and plugins.
- **TypeScript-first** — Full type definitions, module augmentation for custom properties, and autocomplete for tokens, presets, and themes. See [Configuration](docs/configuration.md).

## Installation

```bash
pnpm add @tenphi/tasty
```

Requirements:

- Node.js 20+
- React 18+ (peer dependency for the React entry points)
- `pnpm`, `npm`, or `yarn`

Other package managers:

```bash
npm add @tenphi/tasty
yarn add @tenphi/tasty
```

## Start Here

- **[Getting Started](docs/getting-started.md)** — the canonical onboarding path: install, first component, optional shared `configure()`, ESLint, editor tooling, and rendering mode selection
- **[Docs Hub](docs/README.md)** — choose docs by role and task: runtime, zero-runtime, SSR, design-system authoring, internals, and debugging
- **[Methodology](docs/methodology.md)** — the recommended component model and public API conventions for design-system code

## Choose a Rendering Mode

| Mode | Entry point | Best for | Trade-off |
|------|-------------|----------|-----------|
| **Runtime** | `@tenphi/tasty` | Interactive apps and design systems | Full feature set; CSS is generated on demand at runtime |
| **Zero-runtime** | `@tenphi/tasty/static` | Static sites, SSG, landing pages | Requires the Babel plugin; no component-level `styleProps` or runtime-only APIs |
| **SSR** | `@tenphi/tasty/ssr/*` | Next.js, Astro, and other streaming React SSR setups | Uses runtime `tasty()` with server-collected CSS and hydration cache transfer |

All three share the same DSL, tokens, units, and state mappings. See [Getting Started](docs/getting-started.md#choosing-a-rendering-mode), [Zero Runtime](docs/tasty-static.md), and [Server-Side Rendering](docs/ssr.md).

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
    fill: 'okhsl(98% 0.02 255)',
    color: 'okhsl(28% 0.03 255)',
    border: 'okhsl(88% 0.02 255)',
    radius: '1r',
  },
});

// Just a React component
<Card>Hello World</Card>
```

Every value maps to CSS you'd recognize. This example is intentionally config-free: built-in units work immediately, and standard color values such as `rgb(...)`, `hsl(...)`, named colors, and `okhsl(...)` are all valid without setup. `okhsl(...)` is the recommended choice when you want a design-system-friendly color authoring path from day one.

Use `configure()` when you want to define shared tokens, state aliases, recipes, or other conventions for your app or design system. For a fuller onboarding path, follow [Getting Started](docs/getting-started.md).

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

### Optional: configure shared conventions

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

Use `configure()` once when your app or design system needs shared aliases, tokens, recipes, or parser extensions. Predefined states turn complex selector logic into single tokens, so teams can write `@mobile` instead of repeating media query expressions in every component.

### CSS properties as props

With `styleProps`, a component can expose the styles you choose as normal typed props. That means you can adjust layout, spacing, alignment, or positioning right where the component is used, instead of introducing wrapper elements or reaching for a separate styling API.

This is especially good for prototyping and fast UI iteration: you can shape interfaces quickly, while still staying inside a typed, design-system-aware component API that scales to production.

```tsx
import { tasty, FLOW_STYLES, POSITION_STYLES } from '@tenphi/tasty';

const Space = tasty({
  styles: {
    display: 'flex',
    flow: 'column',
    gap: '1x',
  },
  styleProps: FLOW_STYLES,
});

const Button = tasty({
  as: 'button',
  styles: {
    padding: '1.5x 3x',
    fill: '#primary',
    color: '#primary-text',
    radius: true,
  },
  styleProps: POSITION_STYLES,
});
```

Now you can compose layout and tweak component positioning directly in JSX:

```tsx
<Space flow="row" gap="2x" placeItems="center">
  <Title>Dashboard</Title>
  <Button placeSelf="end">Add Item</Button>
</Space>
```

The same props also support state maps, so responsive values use the exact same API:

```tsx
<Space
  flow={{ '': 'column', '@tablet': 'row' }}
  gap={{ '': '2x', '@tablet': '4x' }}
>
  <Sidebar />
  <Content />
</Space>
```

Layout components can expose flow props. Buttons can expose positioning props. Each component can offer only the style props that make sense for its role, while still keeping tokens, custom units, and state maps fully typed. This works in runtime `tasty()` components, not in `tastyStatic()`.

## How It Actually Works

This is the core idea that makes everything else possible.

For the end-to-end architecture — parsing state keys, building exclusive conditions, merging by output, and materializing selectors and at-rules — see **[Style rendering pipeline](docs/PIPELINE.md)**.

Traditional CSS has two structural problems.

First, the **cascade** resolves conflicts by specificity and source order: when multiple selectors match, the one with the highest specificity wins, or — if specificity is equal — the last one in source order wins. That makes styles inherently fragile. Reordering imports, adding a media query, or composing components from different libraries can silently break styling.

A small example makes this tangible. Two rules for a button's background:

```css
.btn:hover     { background: dodgerblue; }
.btn[disabled] { background: gray; }
```

Both selectors have specificity `(0, 1, 1)`. When the button is hovered **and** disabled, both match — and the last rule in source order wins. Swap the two lines and a hovered disabled button silently turns blue instead of gray. This class of bug is invisible in code review because the logic is correct; only the ordering is wrong.

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

If `@dark` expands to `@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))`, try writing the CSS by hand. A first attempt might look like this:

```css
/* First attempt — the @media branch is too broad */
.t0 { color: var(--text-color); }
:root[data-schema="dark"] .t0 { color: var(--text-on-dark-color); }
@media (prefers-color-scheme: dark) {
  .t0 { color: var(--text-on-dark-color); }
}
```

The `@media` branch fires even when `data-schema="light"` is explicitly set. Fix that:

```css
/* Second attempt — @media is scoped, but the default is still too broad */
.t0 { color: var(--text-color); }
:root[data-schema="dark"] .t0 { color: var(--text-on-dark-color); }
@media (prefers-color-scheme: dark) {
  :root:not([data-schema]) .t0 { color: var(--text-on-dark-color); }
}
```

Better — but the bare `.t0` default still matches unconditionally. It matches in dark mode, it matches when `data-schema="dark"` is set, and it can beat the attribute selector by source order if another rule re-declares it later. There is no selector that says "apply this default only when none of the dark branches win."

This is just *one* property with *one* state, and getting it right already takes multiple iterations. The correct selectors require negating every other branch — which is exactly what Tasty generates automatically:

Tasty generates the correct version automatically:

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

[Try it in the Cube UI Kit Storybook playground →](https://cube-ui-kit.vercel.app/?path=/story/getting-started-tasty-playground--playground)

## Capabilities

This section is a quick product tour. For the canonical guides and references, start from the [Docs Hub](docs/README.md).

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
| Root state | `@root(schema=dark)` | `:root[data-schema="dark"]` |
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

### Auto-Inferred `@property`

CSS custom properties do not animate smoothly by default because the browser does not know how to interpolate their values. The [`@property`](https://developer.mozilla.org/en-US/docs/Web/CSS/@property) at-rule fixes that by declaring a property's syntax, such as `<number>` or `<color>`.

In Tasty, you usually do not need to declare `@property` manually. When a custom property is assigned a concrete value, Tasty infers the syntax and registers the matching `@property` for you:

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

Here, `$pulse-scale: 1` is inferred as `<number>`, so Tasty injects `@property --pulse-scale` automatically before using it in the animation. Numeric types (`<number>`, `<length>`, `<percentage>`, `<angle>`, `<time>`) are inferred from values; `<color>` is inferred from the `#name` token convention.

If you prefer full manual control, disable auto-inference globally with `configure({ autoPropertyTypes: false })`.

### Explicit `@properties`

Declare `@properties` yourself only when you need to override the defaults, for example to set `inherits: false` or provide a custom `initialValue`:

```tsx
'@properties': {
  '$pulse-scale': { syntax: '<number>', inherits: false, initialValue: 1 },
},
```

### React Hooks

For cases where you don't need a full component:

```tsx
import { useStyles, useGlobalStyles, useRawCSS } from '@tenphi/tasty';

function App() {
  const { className } = useStyles({ padding: '2x', fill: '#surface' });
  useGlobalStyles('body', { margin: '0' });
  useRawCSS('@font-face { font-family: "Custom"; src: url(...); }');

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
        states: { '@dark': '@root(schema=dark)' },
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

### Server-Side Rendering

SSR with zero-cost client hydration. Existing `tasty()` components work unchanged — SSR is opt-in and requires no per-component modifications. Supports Next.js (App Router with streaming), Astro (middleware + islands), and any React-based framework via the core API. Requires React 18+.

**Next.js setup:**

```tsx
// app/tasty-registry.tsx
'use client';

import { TastyRegistry } from '@tenphi/tasty/ssr/next';

export default function TastyStyleRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TastyRegistry>{children}</TastyRegistry>;
}
```

```tsx
// app/layout.tsx
import TastyStyleRegistry from './tasty-registry';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        <TastyStyleRegistry>{children}</TastyStyleRegistry>
      </body>
    </html>
  );
}
```

See the [full SSR guide](docs/ssr.md) for Astro integration, streaming SSR, generic framework usage, troubleshooting, and the current requirements.

## Entry Points

| Import | Description | Platform |
|--------|-------------|----------|
| `@tenphi/tasty` | Runtime style engine (`tasty`, hooks, `configure`) | Browser |
| `@tenphi/tasty/static` | Zero-runtime static styles (`tastyStatic`) | Browser |
| `@tenphi/tasty/core` | Lower-level internals (config, parser, pipeline, injector, style handlers) for tooling and advanced use | Browser / Node |
| `@tenphi/tasty/babel-plugin` | Babel plugin for zero-runtime CSS extraction | Node |
| `@tenphi/tasty/zero` | Programmatic extraction API | Node |
| `@tenphi/tasty/next` | Next.js integration wrapper | Node |
| `@tenphi/tasty/ssr` | Core SSR API (collector, context, hydration) | Node |
| `@tenphi/tasty/ssr/next` | Next.js App Router SSR integration | Node |
| `@tenphi/tasty/ssr/astro` | Astro middleware + auto-hydration | Node / Browser |

## Browser Requirements

Tasty's exclusive selector system relies on modern CSS pseudo-class syntax:

- **`:is()`** — available across all major browsers since January 2021 ([MDN Baseline](https://developer.mozilla.org/en-US/docs/Web/CSS/:is)).
- **Level-4 `:not()` with selector lists** — Chrome/Edge 88+, Firefox 84+, Safari 9+, Opera 75+.
- **Not supported:** IE 11.

## Performance

### Bundle Size

All sizes measured with [size-limit](https://github.com/ai/size-limit) — minified and brotli-compressed, including all dependencies.

| Entry point | Size |
|-------------|------|
| `@tenphi/tasty` (runtime + SSR) | ~44 kB |
| `@tenphi/tasty/core` (runtime, no SSR) | ~41 kB |
| `@tenphi/tasty/static` (zero-runtime) | ~1.5 kB |

Run `pnpm size` for exact up-to-date numbers.

### Runtime Benchmarks

If you choose the runtime approach, performance is usually a non-issue in practice. The numbers below show single-call throughput for the core pipeline stages, measured with `vitest bench` on an Apple M1 Max (Node 22).

| Operation | ops/sec | Latency (mean) |
|-----------|--------:|---------------:|
| `renderStyles` — 5 flat properties (cold) | ~72,000 | ~14 us |
| `renderStyles` — state map with media/hover/modifier (cold) | ~22,000 | ~46 us |
| `renderStyles` — same styles (cached) | ~7,200,000 | ~0.14 us |
| `parseStateKey` — simple key like `:hover` (cold) | ~1,200,000 | ~0.9 us |
| `parseStateKey` — complex OR/AND/NOT key (cold) | ~190,000 | ~5 us |
| `parseStateKey` — any key (cached) | ~3,300,000–8,900,000 | ~0.1–0.3 us |
| `parseStyle` — value tokens like `2x 4x` (cold) | ~345,000 | ~3 us |
| `parseStyle` — color tokens (cold) | ~525,000 | ~1.9 us |
| `parseStyle` — any value (cached) | ~15,500,000 | ~0.06 us |

"Cold" benchmarks use unique inputs to bypass all caches. Cached benchmarks reuse a single input and measure the LRU hot path.

Run `pnpm bench` to reproduce.

#### What This Means in Practice

- **Cached path dominates production.** After a component's first render, subsequent renders with stable styles skip the pipeline entirely (React `useMemo` + LRU cache hits at every level). All cached operations are sub-microsecond — effectively free.
- **Cold path is fast enough.** The heaviest cold operation — a complex state map with media queries, hover, and modifiers — takes ~46 us. Even a page with 100 unique styled components adds only ~5 ms of total style computation on first render, negligible next to React reconciliation and DOM work.
- **Cache multipliers are 30x–100x.** This confirms the multi-level LRU architecture (parser, state-key, simplify, condition, pipeline) is delivering real value.
- **Comparable to lighter systems.** Emotion's `css()` is typically 5–20 us for simple styles; Tasty's cold `renderStyles` at ~14 us for 5 properties is in the same range despite doing significantly more work (state maps, design tokens, sub-elements, chunking).
- **On slower devices.** The benchmarks above are from an M1 Max (Geekbench 6 SC ~2,400). A mid-range consumer laptop (~1,800 SC) is roughly 1.3x slower; a mid-range phone (~1,200 SC) is roughly 2x slower; a budget phone (~700 SC) is roughly 3–4x slower. Even at 4x, the heaviest cold operation stays under 200 us and 100 unique components under 20 ms — still well within a single frame budget. The cached path remains sub-microsecond on all devices.

### How It Stays Fast

- CSS is generated and injected only when styles are actually used.
- Multi-level caching avoids repeated parsing and style recomputation.
- Styles are split into reusable chunks and applied as multiple class names, so matching chunks can be reused across components instead of re-injected.
- Style normalization guarantees equivalent style input resolves to the same chunks, improving deduplication hit rates.
- A style garbage collector removes unused styles/chunks over time.
- A dedicated style injector minimizes DOM/style-tag overhead.
- This approach is validated in enterprise-scale apps where runtime styling overhead is not noticeable in normal UI flows.

## Ecosystem

Tasty is the core of a production-ready styling platform. These companion tools complete the picture:

### [ESLint Plugin](https://github.com/tenphi/eslint-plugin-tasty)

`@tenphi/eslint-plugin-tasty` — 27 total lint rules for style property names, value syntax, token existence, state keys, and best practices. The `recommended` preset enables 18 of them as a practical default. Catch typos and invalid styles at lint time, not at runtime.

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

## Built with Tasty

### [tasty.style](https://tasty.style) ([source](https://github.com/tenphi/tasty.style))

The official Tasty documentation and landing page — itself built entirely with Tasty. A showcase for zero-runtime styling via `tastyStatic`, SSR with Next.js, and OKHSL color theming with Glaze.

### [Cube Cloud](https://cube.dev/)

Enterprise universal semantic layer platform by Cube Dev, Inc. Cube Cloud unifies data modeling, caching, access control, and APIs (REST, GraphQL, SQL, AI) for analytics at scale. Tasty has powered its frontend for over 5 years in production.

### [Cube Cloud for Excel and Google Sheets](https://cube.dev/)

A single spreadsheet add-in deployed to both [Microsoft Excel](https://marketplace.microsoft.com/en-us/product/office/WA200008486) and [Google Sheets](https://workspace.google.com/u/0/marketplace/app/cube_cloud_for_sheets/641460343379). Connects spreadsheets to any cloud data platform (BigQuery, Databricks, Snowflake, Redshift, and more) via Cube Cloud's universal semantic layer.

### [Cube UI Kit](https://github.com/cube-js/cube-ui-kit) ([storybook](https://cube-ui-kit.vercel.app/))

Open-source React UI kit built on Tasty + React Aria. 100+ production components proving Tasty works at design-system scale. A reference implementation and a ready-to-use component library.

## Documentation

Start from the docs hub if you want the shortest path to the right guide for your role or rendering mode.

- **[Docs Hub](docs/README.md)** — audience-based navigation across onboarding, design-system authoring, runtime, zero-runtime, SSR, debugging, and internals

### Start here

- **[Getting Started](docs/getting-started.md)** — Installation, first component, optional shared configuration, ESLint plugin setup, editor tooling, and rendering mode decision tree
- **[Methodology](docs/methodology.md)** — The recommended patterns for structuring Tasty components: root + sub-elements, styleProps, tokens, styles vs style, wrapping and extension

### Guides

- **[Building a Design System](docs/design-system.md)** — Practical guide to building a DS layer: token vocabulary, state aliases, recipes, primitives, compound components, override contracts
- **[Adoption Guide](docs/adoption.md)** — Where Tasty sits in the stack, who should adopt it, what you define yourself, and how to introduce it incrementally into an existing design system

### Reference

- **[Style DSL](docs/dsl.md)** — The Tasty style language: state maps, tokens, units, color syntax, extending semantics, recipes, keyframes, and @property
- **[Runtime API](docs/runtime.md)** — React-specific API: `tasty()` factory, component props, variants, sub-elements, and hooks
- **[Configuration](docs/configuration.md)** — Global configuration: tokens, recipes, custom units, style handlers, and TypeScript extensions
- **[Style Properties](docs/styles.md)** — Complete reference for all enhanced style properties: syntax, values, modifiers, and recommendations

### Rendering modes

- **[Zero Runtime (tastyStatic)](docs/tasty-static.md)** — Build-time static styling: Babel plugin setup, Next.js integration, and static style patterns
- **[Server-Side Rendering](docs/ssr.md)** — SSR setup for Next.js, Astro, and generic frameworks: streaming support, cache hydration, and troubleshooting

### Internals

- **[Style rendering pipeline](docs/PIPELINE.md)** — How `Styles` become mutually exclusive CSS rules: parse → exclusives → combinations → handlers → merge → materialize (`src/pipeline/`)
- **[Style Injector](docs/injector.md)** — Internal CSS injection engine: `inject()`, `injectGlobal()`, `injectRawCSS()`, `keyframes()`, deduplication, reference counting, cleanup, SSR support, and Shadow DOM
- **[Debug Utilities](docs/debug.md)** — Runtime CSS inspection via `tastyDebug`: CSS extraction, element inspection, cache metrics, chunk breakdown, and performance monitoring

### Context

- **[Comparison](docs/comparison.md)** — How Tasty compares to Tailwind, Panda CSS, vanilla-extract, StyleX, Stitches, and Emotion: positioning, trade-offs, and when each tool fits best

## License

[MIT](LICENSE)
