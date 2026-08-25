# AGENTS.md — @tenphi/tasty

## Project Overview

`@tenphi/tasty` is a CSS-in-JS styling system and DSL for React. It provides declarative, state-aware styling with design token integration, sub-element styling, and zero-runtime extraction via Babel.

Repository: <https://github.com/tenphi/tasty>

## Quick Reference

| Command | Purpose |
|---|---|
| `pnpm build` | Build via tsdown (ESM, browser + node targets) |
| `pnpm test` | Run tests (vitest — both projects) |
| `pnpm test:node` | Run only the `node` project (pure logic, no DOM) |
| `pnpm test:browser` | Run only the `browser` project (headless Chromium) |
| `pnpm test:setup` | Download the Chromium binary the browser project needs |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Lint source files |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm format` | Format with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm bench` | Run pipeline benchmarks (Node project — the numbers quoted in the README) |
| `pnpm bench:browser` | Run component-render benchmarks (headless Chromium) |
| `pnpm size` | Check bundle sizes (size-limit) |
| `pnpm check:test-only` | Verify test-only code stays out of the build (run after `pnpm build`) |
| `pnpm hygiene` | Run lint + format check + typecheck together |
| `pnpm hygiene:fix` | Auto-fix lint + format, then typecheck |

## Before pushing changes

Follow the ordered steps in [`.cursor/commands/submit-changes.md`](.cursor/commands/submit-changes.md) for the full release-oriented workflow. Before you push **any** branch, at minimum:

1. **Typecheck** — Run `pnpm typecheck`. If it fails, stop and fix errors before formatting or committing.
2. **Lint** — Run `pnpm lint`. If it fails, stop and fix errors before formatting or committing.
3. **Format** — Run `pnpm format` so committed code matches Prettier output.
4. **Public API** — If `src/__snapshots__/public-api.md` changed, the diff **is** a public API change (an added, removed, or renamed export on a `package.json` subpath). Review it line by line and make sure a changeset covers it. Never update that snapshot without one.
5. **Changeset** — If the change affects published package behavior (features, fixes, refactors, perf), create a changeset file in `.changeset/` as described in `submit-changes.md` and include it in the commit. Use `patch` for fixes/small changes, `minor` for new features/non-breaking API changes, `major` for breaking changes. Skip the changeset only when the change is purely internal (docs, CI, repo-only churn, tests with no behavior change).
6. **Commit** — Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`; optional scope). Keep the subject line short. Include the changeset file in the same commit.
7. **Push** — Do not push to `main`. Confirm the current branch, then push with `git push -u origin HEAD`.

## Stack

- **Language**: TypeScript (strict mode, `consistent-type-imports` enforced)
- **Build**: tsdown — ESM, unbundled, dts + sourcemaps, browser + node targets
- **Test**: Vitest 4, globals enabled, split into two projects (see [Test environments](#test-environments))
- **Lint**: ESLint 10 + typescript-eslint + prettier + `@tenphi/eslint-plugin-tasty` (dogfooded on the repo's own style objects; see `eslint.config.js` for the rules disabled because this repo tests the parser)
- **Format**: Prettier — single quotes, semicolons, trailing commas, 80 cols
- **Versioning**: Changesets
- **Runtime**: Node >= 20, pnpm 11

## Entry Points

| Import path | Description | Platform |
|---|---|---|
| `@tenphi/tasty` | Runtime style engine (tasty, hooks, configure) | Browser |
| `@tenphi/tasty/core` | Core engine without SSR | Browser |
| `@tenphi/tasty/static` | Build-time static style generation (tastyStatic) | Browser |
| `@tenphi/tasty/static/inject` | Runtime helper the Babel plugin rewrites `tastyStatic` imports to in inject mode | Browser |
| `@tenphi/tasty/babel-plugin` | Babel plugin for zero-runtime CSS extraction | Node |
| `@tenphi/tasty/zero` | Programmatic zero-runtime extraction API | Node |
| `@tenphi/tasty/zero/next` | Next.js integration wrapper for zero-runtime | Node |
| `@tenphi/tasty/ssr` | Server-side rendering collector + hydration | Node |
| `@tenphi/tasty/ssr/next` | Next.js App Router SSR integration | Node |
| `@tenphi/tasty/ssr/astro` | Astro integration + middleware | Node |
| `@tenphi/tasty/ssr/astro-client` | Astro client-side cache hydration | Browser |
| `@tenphi/tasty/ssr/astro-middleware`<br>`@tenphi/tasty/ssr/astro-middleware-static` | Middleware entrypoints `tastyIntegration()` hands to Astro's `addMiddleware()`. Exported only so Astro can resolve them by specifier — never reference them directly. | Node |

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
    useFontFace.ts       Inject @font-face definitions
    useCounterStyle.ts   Inject @counter-style definitions
    useFunction.ts       Inject CSS @function (custom function) definitions

  injector/              Runtime CSS injection engine
    injector.ts          Core injector (hash dedup, ref counting, cleanup)
    sheet-manager.ts     CSSStyleSheet management
  pipeline/              Style rendering pipeline (parse → exclusives → materialize); see docs/pipeline.md
  parser/                Style value parser & tokenizer (custom DSL)
  styles/                Style property handlers (fill, padding, border, etc.)
  chunks/                Style chunking system
  states/                Predefined state mappings (@hover, @media, etc.)
  plugins/               Plugin system (OKHSL color support, etc.)
  keyframes/             @keyframes support
  properties/            CSS @property support
  functions/             CSS @function support (+ opt-in polyfill)
  font-face/             @font-face support
  counter-style/         @counter-style support
  prop-handlers.ts       Props middleware registry (configure({ propHandlers }))
  ssr/                   Server-side rendering (collector, hydration, framework bindings)
  utils/                 Shared utilities
```

## Core API

- `tasty(options)` — create a styled React component
- `tasty(BaseComponent, options)` — extend an existing component with styles
- `configure(opts)` — set global config (tokens, replaceTokens, units, states, functions, polyfills, keyframes, properties, fontFaces, counterStyles, recipes, presets, handlers, propHandlers, baseStyleProps, globalStyles, plugins)
- `useStyles(styles)` — generate a className from a style object
- `useGlobalStyles(selector, styles)` — inject global styles
- `useRawCSS(css)` — inject raw CSS
- `useKeyframes` / `useProperty` / `useFontFace` / `useCounterStyle` / `useFunction` — inject the corresponding at-rule
- `tastyStatic(styles)` — build-time style generation (zero runtime)

## Documentation Files (`docs/`)

| File | Description |
|---|---|
| [`docs/migration-v3.md`](docs/migration-v3.md) | Migration guide v2 → v3 — every breaking change with a search-and-replace cheat sheet, plus an explicit "not changed" list. Update it whenever a `major` changeset is added. |
| [`docs/README.md`](docs/README.md) | Documentation hub — routes readers by role, rendering mode, and task across onboarding, API docs, internals, and debugging. |
| [`docs/getting-started.md`](docs/getting-started.md) | Getting started guide — prerequisites, installation, first component, configuration setup, ESLint plugin setup, editor tooling, rendering mode decision tree. Start here for initial setup. |
| [`docs/methodology.md`](docs/methodology.md) | Methodology — the recommended patterns for structuring Tasty components: root + sub-elements model (vs BEM), `styleProps` as the public API, `tokens` prop, `styles` vs `style` props, wrapping/extension, how configuration simplifies components, and anti-patterns. |
| [`docs/design-system.md`](docs/design-system.md) | Building a design system — practical how-to for DS teams: designing token vocabularies, defining state aliases, creating recipes, building layout primitives with `styleProps`, compound components with sub-elements, override contracts, and project structure. |
| [`docs/ai-agents.md`](docs/ai-agents.md) | Style rules for AI agents — condensed, rule-based brief on correct value syntax, tokens, units, modifiers, state maps, sub-elements, and special top-level keys. Keep in sync with the DSL and style-property docs. |
| [`docs/dsl.md`](docs/dsl.md) | Style DSL reference — the Tasty style language shared by runtime and static modes: state maps, state key types, color tokens, built-in units, replace tokens, recipes, extending/replacing semantics, advanced states (@media, @parent, @root, :is, :has), keyframes, @property, @font-face, @counter-style, and @function. |
| [`docs/react-api.md`](docs/react-api.md) | React API — `tasty()` factory, component creation, extending, `styleProps`, `modProps`, `tokenProps`, variants, sub-element styling (`elements` prop, selector affix), and style functions (`useStyles`, `useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`, `useFunction`). |
| [`docs/configuration.md`](docs/configuration.md) | Global configuration via `configure()` — CSP nonce, custom state aliases, parser cache size, custom units, custom functions, polyfills, design tokens (`:root` CSS variables), replace tokens (parse-time substitution), recipes, style handlers, props middleware, base style props, and plugins. |
| [`docs/plugins.md`](docs/plugins.md) | Plugins & extension points — what a plugin is, how to choose between `functions`/`units`/`states`/`handlers`/`propHandlers`/`recipes`/`baseStyleProps`, the style-handler and props-middleware contracts, typing your extension, and a worked end-to-end plugin. |
| [`docs/styles.md`](docs/styles.md) | Style properties reference — documents all custom style handlers (`fill`, `padding`, `margin`, `border`, `radius`, `flow`, `preset`, `shadow`, `outline`, `display`, `width`/`height`, `gap`, `inset`, `fade`, `scrollbar`) with their enhanced syntax and modifiers. |
| [`docs/tasty-static.md`](docs/tasty-static.md) | Zero-runtime mode (`tastyStatic`) — build-time CSS generation for static sites and performance-critical pages. Covers Babel plugin setup, Next.js integration, static config files, and limitations. |
| [`docs/pipeline.md`](docs/pipeline.md) | Style rendering pipeline — stages from parsed state keys through exclusive conditions, handler snapshots, merge-by-value, and CSS materialization; condition types, simplification, and caching. Implementation in `src/pipeline/`. |
| [`docs/injector.md`](docs/injector.md) | Internal style injector architecture — hash-based deduplication, reference counting, CSS nesting flattening, keyframes injection, sheet management, SSR support, and Shadow DOM roots. Low-level infrastructure doc. |
| [`docs/debug.md`](docs/debug.md) | Debug utilities (`tastyDebug`) — runtime CSS inspection, cache performance metrics, style chunk analysis, and troubleshooting via browser console. Development-only diagnostics. |
| [`docs/ssr.md`](docs/ssr.md) | Server-side rendering guide — zero-cost hydration, `ServerStyleCollector`, framework integrations (Next.js App Router, Astro), streaming compatibility. Requires React 18+. |
| [`docs/comparison.md`](docs/comparison.md) | Comparison with other styling systems — Tailwind, Panda CSS, vanilla-extract, StyleX, Stitches, Emotion. Covers positioning, abstraction levels, trade-offs, and when Tasty fits vs. alternatives. |
| [`docs/adoption.md`](docs/adoption.md) | Adoption guide — where Tasty sits in the stack, who should use it, what the DS team defines, incremental adoption phases, and what changes for product engineers. |

## Code Conventions

- TypeScript strict mode; `consistent-type-imports` enforced
- Test files: `*.test.ts` / `*.test.tsx`, co-located in `src/`
- Unused variables prefixed with `_` are allowed
- JSX transform: `react-jsx` (no `import React` needed)
- Functional API pattern: factory functions + hooks, no class components. The *styling* API (`tasty`, `useStyles`, `configure`, etc.) is entirely functional. Stateful infrastructure services (`ServerStyleCollector`, `CSSWriter`, `StyleInjector`) are classes but each exposes a `create*()` factory wrapper (`createServerStyleCollector`, `createCSSWriter`) as the canonical public entry point; the class is also exported for advanced/internal use.
- All style values go through the Tasty parser — supports design tokens (`#color`, `$token`), custom units (`2x`, `1r`), auto-calc, and color opacity (`#purple.5`)

## Test environments

Vitest runs two projects, configured in [`vitest.config.ts`](vitest.config.ts):

| Project | Environment | Covers |
|---|---|---|
| `node` | plain Node, no DOM | Parser, style handlers, pipeline, SSR string output, Babel extractor, config merging — pure logic |
| `browser` | headless Chromium via Playwright | Everything that touches `document`, renders React, or asserts on CSS the engine actually parsed |

**Where a new test goes.** Add it to the `BROWSER_TESTS` list in `vitest.config.ts` if it touches `document`, renders React, or asserts on injected CSS; otherwise it lands in `node` automatically. All `*.test.tsx` files are already matched by the list. A DOM test left in the `node` project fails loudly with `document is not defined`, so the mistake is cheap.

**Why a real browser.** Tasty compiles to CSS, and only a CSS engine can tell you whether that CSS is valid. jsdom and happy-dom reject `@container`, `@starting-style`, `@property`, `@function`, and CSS nesting outright — under jsdom, 53 of the 54 snapshots in `advanced-states.test.tsx` were empty strings asserting nothing, and `@container`/`@starting-style` coverage did not exist at all. Chromium accepts these rules, so the snapshots now pin real CSS and an invalid declaration shows up as a dropped property.

**Consequences to keep in mind:**

- The engine reserializes what it accepts. `oklch(var(--x)/.1)` comes back as `oklch(var(--x) / .1)`, and `CSSKeyframesRule.cssText` spans multiple lines. Assert with tolerant matchers, or use `forceTextInjection: true` when the point is to pin Tasty's own output byte-for-byte (see `injector/at-rule-docs.test.ts`).
- Degradation paths must be simulated, not inherited. Chromium supports `@property`, so the "engine has no `@property` support" branch is exercised by stubbing `CSSStyleSheet.prototype.insertRule` — see `simulateNoAtPropertySupport()` in `injector/injector.test.ts`.
- There is no `process` global in the browser, so `vi.stubEnv('NODE_ENV', …)` cannot reach `isDevEnv()`. Use `enableDevWarnings()` from `src/test/dev-env.ts`, which flips the `TASTY_DEBUG` localStorage flag — the switch that works in a real browser.
- First checkout needs `pnpm test:setup` once to download the Chromium binary.

## CI/CD

- **CI**: build, lint, format check, typecheck, dead-code check (`knip`), test-only code check, tests, size limit on push to `main` and PRs. Chromium is installed via Playwright and cached on the lockfile hash.
- **Release**: Changesets — on push to `main`, either creates a version PR or publishes to npm
- **Snapshots**: comment `/snapshot` on a PR for `0.0.0-snapshot.<sha>` release
- **npm trusted publishing**: OIDC provenance via the `release` GitHub environment

## Key Design Decisions

- **No runtime dependencies** except `csstype` (CSS type definitions) and `jiti` (config file loading)
- **Hash-based class names** (`t0`, `t1`, ...) — deterministic within a render, deduped by content hash
- **Reference counting** for component styles (`tasty()`, `useStyles`) — swept by GC once unreferenced. Styles from the standalone functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, …) are *not* cleaned up on unmount; they are replaced per slot (`id`/selector/`name`, per `root`)
- **Streaming-compatible SSR** — works with `renderToPipeableStream` and framework streaming
- **Plugin system** — extensible via `configure({ plugins: [...] })` for custom color spaces, style handlers, props middleware, and more; see `docs/plugins.md`
