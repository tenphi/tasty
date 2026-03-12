# AGENTS.md — @tenphi/tasty

## Project Overview

`@tenphi/tasty` is a CSS-in-JS styling system and DSL for React. It provides declarative, state-aware styling with design token integration, sub-element styling, and zero-runtime extraction via Babel.

Repository: <https://github.com/tenphi/tasty>

## Quick Reference

| Command | Purpose |
|---|---|
| `pnpm build` | Build via tsdown (ESM, browser + node targets) |
| `pnpm test` | Run tests (vitest) |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Lint source files |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm hygiene` | Run lint + format check + typecheck together |
| `pnpm hygiene:fix` | Auto-fix lint + format, then typecheck |

## Stack

- **Language**: TypeScript (strict mode, `consistent-type-imports` enforced)
- **Build**: tsdown — ESM, unbundled, dts + sourcemaps, browser + node targets
- **Test**: Vitest 4, globals enabled, jsdom environment
- **Lint**: ESLint 10 + typescript-eslint + prettier
- **Format**: Prettier — single quotes, semicolons, trailing commas, 80 cols
- **Versioning**: Changesets
- **Runtime**: Node >= 20, pnpm 10

## Entry Points

| Import path | Description | Platform |
|---|---|---|
| `@tenphi/tasty` | Runtime style engine (tasty, hooks, configure) | Browser |
| `@tenphi/tasty/core` | Core engine without SSR | Browser |
| `@tenphi/tasty/static` | Build-time static style generation (tastyStatic) | Browser |
| `@tenphi/tasty/babel-plugin` | Babel plugin for zero-runtime CSS extraction | Node |
| `@tenphi/tasty/zero` | Programmatic zero-runtime extraction API | Node |
| `@tenphi/tasty/next` | Next.js integration wrapper for zero-runtime | Node |
| `@tenphi/tasty/ssr` | Server-side rendering collector + hydration | Node |
| `@tenphi/tasty/ssr/next` | Next.js App Router SSR integration | Node |
| `@tenphi/tasty/ssr/astro` | Astro SSR integration | Node |

## Project Structure

```
src/
  index.ts              Main entry point (runtime exports)
  tasty.tsx              Core tasty() factory — creates styled React components
  config.ts              Global configuration system (configure())
  types.ts               Core TypeScript types
  debug.ts               Runtime debug/diagnostic utilities (tastyDebug)

  core/                  Core engine without SSR side-effects
  static/                tastyStatic() — build-time style generation
  zero/                  Zero-runtime CSS extraction & Babel plugin
    babel.ts             Babel plugin entry
    next.ts              Next.js wrapper
    extractor.ts         Style extraction logic
    css-writer.ts        CSS file writer

  hooks/                 React hooks
    useStyles.ts         Generate className from style definitions
    useGlobalStyles.ts   Inject global styles for a selector
    useRawCSS.ts         Inject raw CSS strings
    useKeyframes.ts      Inject @keyframes animations
    useProperty.ts       Inject CSS @property definitions

  injector/              Runtime CSS injection engine
    injector.ts          Core injector (hash dedup, ref counting, cleanup)
    sheet-manager.ts     CSSStyleSheet management
  pipeline/              Style rendering pipeline (parse → expand → materialize)
  parser/                Style value parser & tokenizer (custom DSL)
  styles/                Style property handlers (fill, padding, border, etc.)
  chunks/                Style chunking system
  states/                Predefined state mappings (@hover, @media, etc.)
  plugins/               Plugin system (OKHSL color support, etc.)
  keyframes/             @keyframes support
  properties/            CSS @property support
  tokens/                Built-in design tokens (colors, spacing, typography, etc.)
  ssr/                   Server-side rendering (collector, hydration, framework bindings)
  utils/                 Shared utilities
```

## Core API

- `tasty(options)` — create a styled React component
- `tasty(BaseComponent, options)` — extend an existing component with styles
- `configure(opts)` — set global config (tokens, units, states, plugins)
- `useStyles(styles)` — generate a className from a style object
- `useGlobalStyles(selector, styles)` — inject global styles
- `useRawCSS(css)` — inject raw CSS
- `tastyStatic(styles)` — build-time style generation (zero runtime)

## Documentation Files (`docs/`)

| File | Description |
|---|---|
| [`docs/usage.md`](docs/usage.md) | Comprehensive usage guide — creating components with `tasty()`, style props, sub-element styling, state-based styling (hover, media queries, container queries), responsive values, recipes, extending components, and React hooks API. Start here to understand the library. |
| [`docs/configuration.md`](docs/configuration.md) | Global configuration via `configure()` — CSP nonce, custom state aliases, parser cache size, custom units, custom functions, design tokens, typography presets, recipes, and plugins. |
| [`docs/styles.md`](docs/styles.md) | Style properties reference — documents all custom style handlers (`fill`, `padding`, `margin`, `border`, `radius`, `flow`, `preset`, `shadow`, `outline`, `display`, `width`/`height`, `gap`, `inset`, `fade`, `scrollbar`) with their enhanced syntax and modifiers. |
| [`docs/tasty-static.md`](docs/tasty-static.md) | Zero-runtime mode (`tastyStatic`) — build-time CSS generation for static sites and performance-critical pages. Covers Babel plugin setup, Next.js integration, static config files, and limitations. |
| [`docs/injector.md`](docs/injector.md) | Internal style injector architecture — hash-based deduplication, reference counting, CSS nesting flattening, keyframes injection, sheet management, SSR support, and Shadow DOM roots. Low-level infrastructure doc. |
| [`docs/debug.md`](docs/debug.md) | Debug utilities (`tastyDebug`) — runtime CSS inspection, cache performance metrics, style chunk analysis, and troubleshooting via browser console. Development-only diagnostics. |
| [`docs/ssr.md`](docs/ssr.md) | Server-side rendering guide — zero-cost hydration, `ServerStyleCollector`, framework integrations (Next.js App Router, Astro), streaming compatibility. Requires React 19+. |
| [`docs/ssr-spec.plan.md`](docs/ssr-spec.plan.md) | SSR implementation specification — detailed design document covering the problem statement, architecture decisions, cache transfer strategy, streaming support, and framework binding contracts. Internal planning doc. |

## Code Conventions

- TypeScript strict mode; `consistent-type-imports` enforced
- Test files: `*.test.ts` / `*.test.tsx`, co-located in `src/`
- Unused variables prefixed with `_` are allowed
- JSX transform: `react-jsx` (no `import React` needed)
- Functional API pattern: factory functions + hooks, no class components
- All style values go through the Tasty parser — supports design tokens (`#color`, `$token`), custom units (`2x`, `1r`), auto-calc, and color opacity (`#purple.5`)

## CI/CD

- **CI**: lint, format check, typecheck, build, tests on push to `main` and PRs
- **Release**: Changesets — on push to `main`, either creates a version PR or publishes to npm
- **Snapshots**: comment `/snapshot` on a PR for `0.0.0-snapshot.<sha>` release
- **npm trusted publishing**: OIDC provenance via the `release` GitHub environment

## Key Design Decisions

- **No runtime dependencies** except `csstype` (CSS type definitions) and `jiti` (config file loading)
- **Hash-based class names** (`t0`, `t1`, ...) — deterministic within a render, deduped by content hash
- **Reference counting** for injected styles — auto-cleanup when components unmount
- **Streaming-compatible SSR** — works with `renderToPipeableStream` and framework streaming
- **Plugin system** — extensible via `configure({ plugins: [...] })` for custom color spaces, etc.
