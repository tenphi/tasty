# Zero Runtime Mode (tastyStatic)

`tastyStatic` is a build-time utility for generating CSS with zero runtime overhead. It's designed for static sites, no-JS websites, and performance-critical applications where you want to eliminate all runtime styling code. For the broader docs map, see the [Docs Hub](README.md).

---

## When to Use

- **Static site generation (SSG)** — Pre-render all styles at build time
- **No-JavaScript websites** — CSS works without any JS runtime
- **Performance-critical pages** — Zero runtime overhead for styling
- **Landing pages** — Minimal bundle size with pre-generated CSS

## Requirements

The zero-runtime mode is part of the main `@tenphi/tasty` package but requires additional peer dependencies depending on your setup:

| Dependency | Version | Required for |
|---|---|---|
| `@babel/core` | >= 7.24 | Babel plugin (`@tenphi/tasty/babel-plugin`) |
| `@babel/helper-plugin-utils` | >= 7.24 | Babel plugin |
| `@babel/types` | >= 7.24 | Babel plugin |
| `jiti` | >= 2.6 | Next.js wrapper (`@tenphi/tasty/zero/next`) when using `configFile` option |

All of these are declared as optional peer dependencies of `@tenphi/tasty`. Install only what your setup requires:

```bash
# For any Babel-based setup (Vite, custom Babel config, etc.)
pnpm add -D @babel/core @babel/helper-plugin-utils @babel/types

# For Next.js with TypeScript config file
pnpm add -D @babel/core @babel/helper-plugin-utils @babel/types jiti
```

---

## Quick Start

### Basic Usage

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

// Define styles - returns StaticStyle object
const button = tastyStatic({
  display: 'inline-flex',
  padding: '2x 4x',
  fill: '#purple',
  color: '#white',
  radius: '1r',
});

// Use in JSX - works via toString() coercion
<button className={button}>Click me</button>

// Or access className explicitly
<button className={button.className}>Click me</button>
```

---

## API Reference

### tastyStatic(styles)

Creates a `StaticStyle` object from a styles definition.

```tsx
const card = tastyStatic({
  padding: '4x',
  fill: '#white',
  border: true,
  radius: true,
});
```

### tastyStatic(base, styles)

Extends an existing `StaticStyle` with additional styles. Uses `mergeStyles` internally for proper nested selector handling.

```tsx
const button = tastyStatic({
  padding: '2x 4x',
  fill: '#blue',
  Icon: { color: '#white' },
});

const primaryButton = tastyStatic(button, {
  fill: '#purple',
  Icon: { opacity: 0.8 },
});
```

### tastyStatic(selector, styles)

Generates global styles for a CSS selector. The call is removed from the bundle after transformation.

```tsx
tastyStatic('body', {
  fill: '#surface',
  color: '#text',
  preset: 't3',
});
```

---

## StaticStyle Object

| Property | Type | Description |
|----------|------|-------------|
| `className` | `string` | Space-separated class names for use in JSX |
| `styles` | `Styles` | The original (or merged) styles object |
| `toString()` | `() => string` | Returns `className` for string coercion |

---

## Babel Plugin Configuration

### Basic Configuration

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', {
      output: 'public/tasty.css',
    }]
  ]
};
```

These examples use `data-schema="dark"` as the root-state convention. If your app already uses a different root attribute such as `data-theme`, keep the same alias pattern and swap the attribute name consistently in your zero-runtime config.

### With Configuration

```javascript
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', {
      output: 'public/tasty.css',
      config: {
        states: {
          '@mobile': '@media(w < 768px)',
          '@tablet': '@media(w < 1024px)',
          '@dark': '@root(schema=dark)',
        },
        devMode: true,
      },
    }]
  ]
};
```

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | `string` | `'tasty.css'` | Path for generated CSS file |
| `mode` | `'file' \| 'inject'` | `'file'` | `'file'` writes CSS to disk; `'inject'` embeds CSS inline in JS (see [Inject Mode](#inject-mode)) |
| `configFile` | `string` | — | Absolute path to a TS/JS module that default-exports a `TastyZeroConfig` object. JSON-serializable alternative to `config` — required for Turbopack. |
| `config` | `TastyZeroConfig \| () => TastyZeroConfig` | `{}` | Inline config object or factory function. Takes precedence over `configFile`. |
| `configDeps` | `string[]` | `[]` | Absolute file paths that affect config (for cache invalidation) |
| `injectImport` | `boolean` | `true` | Replace `@tenphi/tasty/static` imports with an import of the generated CSS file. Set to `false` to manage CSS imports manually. |
| `config.states` | `Record<string, string>` | `{}` | Predefined state aliases (e.g. `{ '@mobile': '@media(w < 768px)' }`) |
| `config.devMode` | `boolean` | `false` | Add source comments to CSS |
| `config.tokens` | `ConfigTokens` | — | Design tokens injected as CSS custom properties on `:root`. Values are parsed through the Tasty DSL. Supports state maps for responsive/themed tokens. |
| `config.replaceTokens` | `Record<string, string \| number>` | — | Parse-time token substitution. Keys use `$name` for custom properties and `#name` for color tokens. |
| `config.recipes` | `Record<string, RecipeStyles>` | `{}` | Predefined style recipes |
| `config.keyframes` | `Record<string, KeyframesSteps>` | — | Global `@keyframes` definitions available to all `tastyStatic` calls |
| `config.fontFaces` | `Record<string, FontFaceInput>` | — | Global `@font-face` definitions |
| `config.counterStyles` | `Record<string, CounterStyleDescriptors>` | — | Global `@counter-style` definitions |
| `config.units` | `Record<string, string \| UnitHandler>` | — | Custom units for the style parser (merged with built-ins). E.g. `{ em: 'em', vw: 'vw' }` |
| `config.functions` | `Record<string, FunctionDefinition \| Function>` | — | Custom functions (merged). Bare keys → parse functions; `$$name` keys → declarative CSS `@function` definitions |
| `config.polyfills` | `{ functions?: boolean }` | `{}` | Opt-in polyfills. `functions: true` inlines `@function` calls into plain CSS at build time |
| `config.plugins` | `TastyPlugin[]` | — | Plugins that extend tasty with custom functions, units, states, and handlers |
| `config.handlers` | `Record<string, StyleHandlerDefinition>` | — | Custom style handlers that transform style properties into CSS declarations |
| `config.presets` | `Record<string, TypographyPreset>` | — | Typography presets — shorthand for `generateTypographyTokens()`. Generated tokens merge under explicit `tokens`. |
| `config.globalStyles` | `Record<string, Styles>` | — | Global Tasty styles keyed by CSS selector. Supports the full style syntax. |
| `config.autoPropertyTypes` | `boolean` | `true` | Automatically infer and register CSS `@property` declarations from values |
| `config.parserCacheSize` | `number` | `1000` | Parser LRU cache size. Larger values improve performance for builds with many unique style values |
| `config.namePrefix` | `string` | `'ts'` | Prefix prepended to every generated identifier. Defaults to `'ts'` so static classes never collide with runtime (`'t'`) classes. See [Configuration: Name prefix](configuration.md#name-prefix). |

### Coexisting with runtime tasty

When a page mixes `tastyStatic` with runtime `tasty`, both must use **different** `namePrefix` values. The defaults handle this automatically (`'t'` for runtime, `'ts'` for zero-runtime). If you customize one, customize the other:

```ts
// tasty-zero.config.ts (Babel plugin)
export default { namePrefix: 'mbs' };
```

```ts
// app entry (runtime configure)
configure({ namePrefix: 'mb' });
```

---

## Recipes

Recipes work with `tastyStatic` the same way as with runtime `tasty`:

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', {
      output: 'public/tasty.css',
      config: {
        recipes: {
          card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
          elevated: { shadow: '2x 2x 4x #shadow' },
        },
      },
    }]
  ]
};
```

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

const card = tastyStatic({
  recipe: 'card elevated',
  color: '#text',
});

<div className={card}>Styled card</div>
```

---

## Next.js Integration

The `withTastyZero` wrapper configures both **webpack** and **Turbopack** automatically. No `--webpack` flag is needed — it works with whichever bundler Next.js uses.

```typescript
// next.config.ts
import { withTastyZero } from '@tenphi/tasty/zero/next';

export default withTastyZero({
  output: 'public/tasty.css',
  configFile: './app/tasty-zero.config.ts',
  configDeps: ['./app/theme.ts'],
})({
  reactStrictMode: true,
});
```

### `withTastyZero` Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | `string` | `'public/tasty.css'` | Output path for CSS relative to project root |
| `mode` | `'file' \| 'inject'` | `'file'` | `'file'` writes CSS to disk; `'inject'` embeds CSS inline in JS |
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `configFile` | `string` | — | Path to a TS/JS module that default-exports `TastyZeroConfig`. Recommended for Turbopack compatibility. |
| `config` | `TastyZeroConfig` | — | Inline config object. For static configs that don't change during dev. |
| `configDeps` | `string[]` | `[]` | Extra files the config depends on (for cache invalidation) |

### Turbopack Support

Starting with Next.js 16, Turbopack is the default bundler. `withTastyZero` supports it out of the box by injecting `turbopack.rules` with `babel-loader` and JSON-serializable options.

The `configFile` option is key for Turbopack — it passes a file path (JSON-serializable) instead of a function, and the Babel plugin loads the config internally via jiti.

**Requirements**: `babel-loader` must be installed in your project:

```bash
pnpm add babel-loader
```

### CSS Injection

`withTastyZero` automatically injects the generated CSS into your app. Every file that imports from `@tenphi/tasty/static` gets its import replaced with an import of the output CSS file at build time. No manual CSS import is needed.

The generated CSS file (e.g. `public/tasty.css`) is created as an empty stub before the first build if it doesn't exist, so there's no chicken-and-egg problem with fresh clones or CI builds. Add it to `.gitignore`:

```gitignore
public/tasty.css
```

---

## Vite Integration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@tenphi/tasty/babel-plugin', {
            output: 'public/tasty.css',
            config: {
              states: { '@mobile': '@media(w < 768px)' },
            },
          }],
        ],
      },
    }),
  ],
});
```

---

## Build Transformation

### Before (Source Code)

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  padding: '2x 4x',
  fill: '#purple',
  color: '#white',
});

tastyStatic('.heading', { preset: 'h1' });

export const Button = () => <button className={button}>Click</button>;
```

### After (Production Build)

```tsx
const button = {
  className: 'ts3f2a1b ts8c4d2e',
  styles: { padding: '2x 4x', fill: '#purple', color: '#white' },
  toString() { return this.className; }
};

export const Button = () => <button className={button}>Click</button>;
```

### Generated CSS (tasty.css)

```css
/* Generated by @tenphi/tasty/zero - DO NOT EDIT */

.ts3f2a1b.ts3f2a1b {
  padding: 16px 32px;
}

.ts8c4d2e.ts8c4d2e {
  background: #9370db;
  color: #fff;
}

.heading.heading {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.2;
}
```

---

## Inject Mode

By default the Babel plugin writes CSS to a file (`mode: 'file'`). **Inject mode** (`mode: 'inject'`) embeds CSS inline in your JavaScript and injects it at runtime via a tiny injector. No CSS file is produced.

This is ideal for **reusable components**, **extensions**, and **libraries** where consumers shouldn't need to manage an external CSS file.

### How It Works

1. The Babel plugin extracts CSS at build time (same pipeline as file mode).
2. Instead of writing to a `.css` file, the CSS is embedded as string literals in the JS output.
3. The `@tenphi/tasty/static` import is rewritten to `@tenphi/tasty/static/inject`.
4. Each `tastyStatic` call becomes a self-contained expression that injects its CSS and evaluates to a `StaticStyle` object.

### Configuration

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['@tenphi/tasty/babel-plugin', {
      mode: 'inject',
      config: {
        states: { '@mobile': '@media(w < 768px)' },
      },
    }]
  ]
};
```

With Next.js:

```typescript
// next.config.ts
import { withTastyZero } from '@tenphi/tasty/zero/next';

export default withTastyZero({
  mode: 'inject',
  configFile: './app/tasty-zero.config.ts',
})({
  reactStrictMode: true,
});
```

When `mode` is `'inject'`, the `output` and `injectImport` options are ignored.

### Build Transformation (inject mode)

**Before:**

```tsx
import { tastyStatic } from '@tenphi/tasty/static';

const button = tastyStatic({
  padding: '2x 4x',
  fill: '#purple',
});

tastyStatic('.heading', { preset: 'h1' });
```

**After:**

```tsx
import { injectCSS as _$i } from '@tenphi/tasty/static/inject';

const button = (_$i("ts3f2a1b ts8c4d2e", ".ts3f2a1b.ts3f2a1b{padding:16px 32px}\n.ts8c4d2e.ts8c4d2e{background:#9370db}"), {
  className: 'ts3f2a1b ts8c4d2e',
  styles: { padding: '2x 4x', fill: '#purple' },
  toString() { return this.className; }
});

_$i(".heading", ".heading{font-size:2.5rem;font-weight:700;line-height:1.2}");
```

### Dev Mode / HMR

Class names are content-hashed (`ts` + MD5). When styles change, a new hash produces a new `_$i` call that injects fresh CSS. The injector deduplicates by id, so unchanged styles are skipped. Old CSS stays in the DOM but is harmless since no elements reference those class names.

### Limitations (inject mode)

- **Client-side only** — Styles are injected via the DOM, so they are not available during SSR. For server-rendered apps, use `mode: 'file'` or the runtime `tasty()`.
- **Larger JS bundle** — CSS is embedded in JavaScript, increasing bundle size. Best suited for components and extensions, not full-app styling.

---

## Style Extension

```tsx
// Base button
const button = tastyStatic({
  display: 'inline-flex',
  padding: '2x 4x',
  radius: '1r',
  fill: '#gray.20',
  color: '#text',
  transition: 'fill 0.15s',
});

// Variants
const primaryButton = tastyStatic(button, {
  fill: '#purple',
  color: '#white',
});

const dangerButton = tastyStatic(button, {
  fill: '#danger',
  color: '#white',
});
```

---

## State-based Styling

```tsx
const card = tastyStatic({
  padding: {
    '': '4x',
    '@mobile': '2x',
  },
  display: {
    '': 'flex',
    '@mobile': 'block',
  },
});
```

---

## Extending Style Types (TypeScript)

If you add custom style properties, use module augmentation so `tastyStatic` recognizes them too. See [Extending Style Types](configuration.md#extending-style-types-typescript) in the configuration docs.

---

## Limitations

1. **Static values only** — All style values must be known at build time
2. **No runtime props** — Cannot use `styleProps` or dynamic `styles` prop
3. **No mods at runtime** — Modifiers must be defined statically
4. **Build-time transformation required** — Babel plugin must process files

### Workarounds

For dynamic styling needs, combine with regular CSS or CSS variables:

```tsx
const card = tastyStatic({
  padding: '4x',
  fill: 'var(--card-bg, #white)',
});

<div
  className={card}
  style={{ '--card-bg': isActive ? '#purple' : '#white' }}
/>
```

---

## Best Practices

1. **Define base styles** for common patterns, then extend for variants
2. **Use selector mode** for global/body styles
3. **Enable devMode** in development for easier debugging
4. **Configure states** for consistent responsive breakpoints

---

## Common Issues

- No CSS file is generated: make sure the Babel plugin actually runs for files importing `@tenphi/tasty/static`, and verify the `output` path is writable.
- Styles stay dynamic by mistake: `tastyStatic()` only supports build-time-known values. Move runtime values to CSS variables or switch that component to runtime `tasty()`.
- Turbopack config behaves inconsistently: prefer `configFile` over inline functions so the setup stays JSON-serializable.

---

## Related

- [Docs Hub](README.md) — Choose the right guide by task or rendering mode
- [Style DSL](dsl.md) — State maps, tokens, units, extending semantics (shared by runtime and static)
- [React API](react-api.md) — Runtime styling: `tasty()` factory, component props, variants, sub-elements, style functions
- [Configuration](configuration.md) — Global configuration: tokens, recipes, custom units, and style handlers
