# Server-Side Rendering (SSR)

Tasty supports server-side rendering with zero-cost client hydration. This does **not** introduce a separate styling engine: `tasty()` uses the same rendering pipeline on the server and in the browser, while the SSR integrations add server-side CSS collection and client-side cache hydration. Your existing `tasty()` components work unchanged, and SSR remains opt-in with no per-component modifications. For the broader docs map, see the [Docs Hub](README.md).

## Zero-runtime terminology

Zero-runtime delivery is an outcome, not an alias for `tastyStatic()`. When `tasty()` components render only on the server, their CSS is delivered with the HTML and no Tasty styling runtime is shipped to the browser. Astro's `tastyIntegration({ islands: false })` is the explicit integration for this setup. Server-only Next.js React Server Components follow the same architecture, although you should verify the generated output for your deployment.

`tastyStatic()` reaches the same client-side outcome by extracting CSS during the build instead of during React rendering. Use it when extraction must happen before rendering or when the consumer is not React; see [Build-Time Extraction](tasty-static.md).

---

## Requirements

| Dependency | Version | Required for                                                                                    |
| ---------- | ------- | ----------------------------------------------------------------------------------------------- |
| `react`    | >= 18   | All SSR entry points (matches the current peer dependency of `@tenphi/tasty`)                   |
| `next`     | >= 14   | Next.js integration (`@tenphi/tasty/ssr/next`) — App Router with `useServerInsertedHTML`        |
| Node.js    | >= 20   | Generic / streaming SSR (`@tenphi/tasty/ssr`) — uses `node:async_hooks` for `AsyncLocalStorage` |

The Astro integration (`@tenphi/tasty/ssr/astro`) needs `@astrojs/react`. Like `@tenphi/tasty/ssr`, it imports `node:async_hooks`, so the server runtime must provide it. `css: { mode: 'extract' }` requires Astro 5 or newer.

---

## How It Works

`tasty()` components are hook-free and use `computeStyles()` internally — a synchronous, framework-agnostic function. On the server, `computeStyles()` discovers a `ServerStyleCollector` via a registered getter (module-level for Next.js, `globalThis` for Astro/generic frameworks using `AsyncLocalStorage`) and collects CSS into it instead of trying to access the DOM. On the client, CSS is injected synchronously into the DOM during render; the injector's content-based cache makes this idempotent. The collector accumulates all styles and serializes them as `<style>` tags plus a class-list script in the HTML. On the client, `hydrateTastyClasses()` pre-populates the injector's rules map with the rendered class names so that `computeStyles()` skips the rendering pipeline entirely during hydration.

```
Server                         Client
──────                         ──────
tasty() renders                hydrateTastyClasses() reads window.__TASTY__
  └─ computeStyles()              └─ marks rendered class names as already-in-DOM
       └─ collector.collect()
                                 tasty() renders
After render:                    └─ computeStyles()
  <style data-tasty-ssr>             └─ class name known → skip pipeline
  <script> (pushes to __TASTY__)     └─ no CSS re-injection
```

---

## Next.js (App Router)

### 1. Create the registry

Create a client component that wraps your tree with `TastyRegistry`:

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

### 2. Add to root layout

Wrap your application in the registry:

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

That's it. All `tasty()` components inside the tree automatically get SSR support. No per-component changes needed.

### Optional shared globals stylesheet

By default, configured global CSS is included in the streamed Tasty style tag
for every route. `withTastyNext()` can move that stable CSS into one
content-hashed stylesheet shared by all routes while leaving component and hook
styles in the normal streaming path.

Keep the Tasty config in a side-effect-free module:

```ts
// app/tasty.config.ts
import type { TastyConfig } from '@tenphi/tasty';

const config: TastyConfig = {
  tokens: { $gap: '8px', '#brand': 'rebeccapurple' },
  globalStyles: { body: { margin: '0', color: '#brand' } },
  fontFaces: {
    Brand: { src: 'url("/fonts/brand.woff2") format("woff2")' },
  },
};

export default config;
```

Use it from the Next config:

```ts
// next.config.ts
import { withTastyNext } from '@tenphi/tasty/ssr/next-config';
import config from './app/tasty.config';

export default withTastyNext({
  config,
})({
  // your Next.js config
});
```

The runtime must receive the same config. Import and configure it before the
registry renders:

```tsx
// app/tasty-registry.tsx
'use client';

import { configure } from '@tenphi/tasty';
import { TastyRegistry } from '@tenphi/tasty/ssr/next';
import config from './tasty.config';

configure(config);

export default function TastyStyleRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TastyRegistry>{children}</TastyRegistry>;
}
```

The generated file contains eager configuration artifacts: built-in and custom
`@property` rules, tokens and presets, `@font-face`, `@counter-style`, native
CSS `@function` definitions, and `globalStyles`. Route-dependent component
rules and calls to `useGlobalStyles`, `useRawCSS`, `useKeyframes`,
`useProperty`, `useFontFace`, `useCounterStyle`, and `useFunction` remain
route-specific. Configured keyframes referenced by `globalStyles` are included in the file; all
other configured keyframes stay lazy and stream only when a route references
them.

The default output directory is `public/_tasty`. The wrapper adds the generated
URL to `TastyRegistry`, respects `basePath`, preserves existing `env` and
`headers` config, and serves the content-hashed file with an immutable one-year
cache header on Next server deployments. Static exports keep the content-hashed
URL and leave cache headers to the hosting provider. Older hashes are not
deleted automatically, so rolling deployments cannot break pages from the
previous build; clean the generated directory as part of a clean deployment if
needed. Page-relative CSS resources such as
`url(../fonts/brand.woff2)` are rejected because moving them would change their
meaning; use root-relative, absolute, or data URLs.

`withTastyNext()` options:

| Option       | Type          | Default                   | Description                                                            |
| ------------ | ------------- | ------------------------- | ---------------------------------------------------------------------- |
| `config`     | `TastyConfig` | —                         | Config object; takes precedence over `configFile`                      |
| `configFile` | `string`      | —                         | Project-relative config module path; requires the optional `jiti` peer |
| `rootDir`    | `string`      | current directory         | Next app root when the build runs from a monorepo root                 |
| `outputDir`  | `string`      | `public/_tasty`           | Filesystem output directory                                            |
| `publicPath` | `string`      | inferred from `outputDir` | Root-relative URL; required when output is outside `public`            |
| `enabled`    | `boolean`     | `true`                    | Disable generation without changing wrapper composition                |

### How it works

- `TastyRegistry` is a `'use client'` component, but Next.js still server-renders it on initial page load. The `'use client'` boundary is required solely to access `useServerInsertedHTML` — **not** because `tasty()` components need the client.
- During SSR, `TastyRegistry` creates a `ServerStyleCollector` and registers it via a module-level getter (not `globalThis` — this avoids leaking between Next.js's separate RSC and SSR module graphs). It also wraps children in a React context provider so that hooks inside the SSR tree can discover the collector. All style functions — `tasty()` components, `computeStyles()`, `useStyles()`, `useGlobalStyles()`, `useRawCSS()`, `useKeyframes()`, `useProperty()`, `useFontFace()`, `useCounterStyle()`, and `useFunction()` — discover the collector through the module-level getter or context provider.
- `TastyRegistry` uses `useServerInsertedHTML` to flush collected CSS into the HTML stream as `<style data-tasty-ssr>` tags. This is fully streaming-compatible — styles are injected alongside each Suspense boundary as it resolves.
- A companion inline `<script>` tag pushes the rendered class names into `window.__TASTY__` for each flush. This streaming-friendly approach accumulates the class list incrementally as Suspense boundaries resolve.
- When the `@tenphi/tasty/ssr/next` module loads on the client, `hydrateTastyClasses()` runs automatically from `window.__TASTY__` and pre-populates the injector's rules map. During hydration, `computeStyles()` sees the class name is already registered and skips the entire pipeline.

### Using Tasty in Server Components

Every Tasty style function needs no `'use client'`, so it can be used directly in React Server Components:

- `tasty()` components — dynamic `styleProps` like `<Grid flow="column">` work normally
- `useStyles()` and its hook-free equivalent `computeStyles()` — a class name for any element
- `useGlobalStyles()`, `useRawCSS()` — inject styles by selector
- `useKeyframes()`, `useProperty()`, `useFontFace()`, `useCounterStyle()`, `useFunction()` — inject ancillary CSS rules

Next.js renders Server Components in a separate module graph that cannot see the collector `TastyRegistry` registers, so their CSS takes the RSC inline path: it is accumulated in a per-request `React.cache` and emitted as an inline `<style>` tag by the next `tasty()` component in the tree. Standalone style functions, `useStyles()` included, cannot emit CSS on their own, so make sure a `tasty()` component renders after them in every RSC tree. The RSC path does not emit configured globals (tokens, `@property`, `globalStyles`); those come from `TastyRegistry`'s collector or the `withTastyNext()` shared stylesheet. For the same reason, import the module that calls `configure()` from `app/layout.tsx` as well as from the registry module, so the RSC graph sees the same states, recipes, and units.

### Options

```tsx
// Skip cache state transfer (saves payload size at the cost of hydration perf)
<TastyRegistry transferCache={false}>{children}</TastyRegistry>
```

### CSP nonce

If your app uses Content Security Policy with nonces, configure it before rendering:

```tsx
// app/tasty-registry.tsx: the 'use client' module that renders TastyRegistry
import { configure } from '@tenphi/tasty';

configure({ nonce: 'your-nonce-value' });
```

The nonce is automatically applied to all `<style>` and `<script>` tags injected by `TastyRegistry`. Call it in the module that renders `TastyRegistry`; `app/layout.tsx` is a Server Component and configures a separate module instance.

---

## Astro

Tasty offers several levels of Astro integration. Choose the one that matches your needs:

| Setup                                                            | Config needed | Deduplication                       | Hooks work                        | Client JS      |
| ---------------------------------------------------------------- | ------------- | ----------------------------------- | --------------------------------- | -------------- |
| Zero setup                                                       | None          | None (each element inlines its CSS) | No (style functions emit nothing) | None           |
| `tastyIntegration({ islands: false })`                           | One line      | Cross-tree                          | Yes                               | None           |
| `tastyIntegration()`                                             | One line      | Cross-tree                          | Yes                               | Auto-hydration |
| `tastyIntegration({ css: { mode: 'extract' } })`                 | One line      | Cross-tree and cross-page           | Yes                               | Auto-hydration |
| `tastyIntegration({ islands: false, css: { mode: 'extract' } })` | One line      | Cross-tree and cross-page           | Yes                               | None           |

### Zero setup (static pages)

`tasty()` components work in Astro with **no configuration**. Each component emits its own inline `<style>` tag during server rendering via the RSC inline path. Just import and use:

```tsx
// src/components/Card.tsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  styles: {
    padding: '4x',
    fill: '#fff',
    radius: '1r',
    border: '1bw solid #ddd',
  },
});

export default Card;
```

```astro
---
// src/pages/index.astro
import Card from '../components/Card.tsx';
---

<html>
  <body>
    <Card>Styled with zero setup</Card>
  </body>
</html>
```

**Trade-offs**: Astro renders React with the standard `react` build, where `React.cache` does nothing, so there is no per-request style cache. Every `tasty()` element inlines the full CSS for its classes, even when the same component renders twice. Configured globals (`:root` tokens, `@property` defaults, `globalStyles`, `@font-face`) are never emitted, because only the SSR collector emits them, and CSS from `useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`, and `useFunction` is dropped. Without the [default properties](dsl.md#default-properties), styles that read them resolve to nothing: `border: true` and `outline: true` draw nothing, and `transition` with no duration does not animate. In development, Tasty warns once that it is rendering without a style collector.

Best for trying Tasty out with plain values, as above. Use `tastyIntegration()` for anything that relies on `configure()` or on Tasty's default tokens.

### Astro Integration (recommended)

For production use, add `tastyIntegration()` to your Astro config. This registers middleware automatically and, by default, injects client-side hydration for islands.

#### With islands (default)

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { tastyIntegration } from '@tenphi/tasty/ssr/astro';

export default defineConfig({
  integrations: [react(), tastyIntegration()],
});
```

This gives you:

- A `ServerStyleCollector` per request via `AsyncLocalStorage`, deduplicating CSS across all React trees on the page
- A single consolidated `<style data-tasty-ssr>` injected into `</head>`
- A `<script>` tag pushing the rendered class names into `window.__TASTY__` for client hydration
- Auto-injected client hydration script (via `injectScript('before-hydration')`) so islands skip the style pipeline during hydration -- no need to import anything manually in each island component

All style functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`) work on the server.

```astro
---
// src/pages/index.astro
import Card from '../components/Card.tsx';
import Interactive from '../components/Interactive.tsx';
---

<html>
  <body>
    <Card>Static -- styles are inlined into the page head</Card>
    <Interactive client:load>Island -- cache hydrated automatically</Interactive>
  </body>
</html>
```

#### Static only (no client JS)

If your site has no `client:*` islands, skip the hydration script and cache transfer:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { tastyIntegration } from '@tenphi/tasty/ssr/astro';

export default defineConfig({
  integrations: [react(), tastyIntegration({ islands: false })],
});
```

This gives the same middleware deduplication and hook support, but ships zero client-side JavaScript. No class-list `<script>` is emitted.

#### Build-wide CSS extraction

Static Astro builds can move Tasty CSS into content-hashed, browser-cacheable
shared and page assets:

```ts
export default defineConfig({
  integrations: [
    react(),
    tastyIntegration({
      islands: false,
      css: {
        mode: 'extract',
      },
    }),
  ],
});
```

`css.mode` defaults to `'inline'`, so existing projects keep their current
output. Extraction requires Astro 5 or newer and only applies to prerendered
production pages. Development, preview-time SSR, and on-demand routes continue
to receive the normal inline `<style data-tasty-ssr>` output.

Extraction writes every artifact emitted by all styled pages to a shared
stylesheet. Each page's strict set difference is written to a separate page
stylesheet. The shared link comes first and the page link follows, so shared
styles form the base cascade and page-only styles can override them. A fully
shared page omits the empty page stylesheet. If generated pages have no common
artifacts, each page receives only its page stylesheet.

The shared-base/page-override order is the extraction-mode cascade contract.
It does not preserve an inline artifact order where a page-only rule originally
appeared before a shared rule. Use shared styles for defaults and page-only
styles for overrides.

Extracted CSS preserves resource URLs verbatim. Relative URLs in an inline
style resolve from the page, but in an extracted stylesheet they resolve from
the asset directory. Use absolute URLs or data URLs when extraction is enabled.
Root-relative URLs such as `url(/fonts/brand.woff2)` are also safe while the
stylesheet stays on the page's origin. The build fails with a clear error if an
artifact contains a page-relative or fragment-only URL, including URL strings
in `image-set()`, `image()`, `src()`, and `@import`.

Assets are written under Astro's configured `build.assets` directory (for
example, `/_astro/tasty.shared.a1b2c3.css` and
`/_astro/tasty.page.d4e5f6.css`). Links include the configured Astro `base`, so
nested routes do not need relative-path handling. Content hashes and output are
deterministic for identical builds. If `build.assetsPrefix` is configured,
Tasty uses its CSS-specific prefix (or `fallback`) just like Astro-generated
stylesheets. When that prefix points to a different origin, root-relative
resources would resolve against the asset origin rather than the page's origin,
so the build rejects them as well. Tasty compares the prefix with Astro's `site`
when it is configured; without `site`, an absolute or protocol-relative prefix
is treated conservatively as cross-origin. Use a fully absolute resource URL in
that configuration.

### Manual middleware (advanced)

If you need to compose Tasty's middleware with other middleware (e.g., via `sequence()`), use `tastyMiddleware()` directly:

```ts
// src/middleware.ts
import { sequence } from 'astro:middleware';
import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';

export const onRequest = sequence(tastyMiddleware(), myOtherMiddleware);
```

For island hydration with manual middleware, import the client module in a shared entry point or in each island:

```tsx
import '@tenphi/tasty/ssr/astro-client';
```

#### Options

```ts
// Skip cache state transfer (static-only, no islands)
export const onRequest = tastyMiddleware({ transferCache: false });
```

Build-wide extraction (`css: { mode: 'extract' }`) is available only through `tastyIntegration()`; `tastyMiddleware()` always inlines CSS.

### How it works

Astro's `@astrojs/react` renderer calls `renderToString()` for each React component without wrapping the tree in a provider. The middleware creates a `ServerStyleCollector` and binds it via `AsyncLocalStorage`. All `computeStyles()` calls within the request discover this collector automatically.

- **Static components** (no `client:*`): Styles are collected during `renderToString` and injected into `</head>` as a single `<style>` tag. No JavaScript is shipped.
- **Islands** (`client:load`, `client:visible`, etc.): Styles are collected during SSR the same way. On the client, the hydration script (auto-injected by `tastyIntegration()` or manually via `@tenphi/tasty/ssr/astro-client`) reads the class list from `window.__TASTY__` and pre-populates the injector's rules map. The island's `computeStyles()` calls see the class names as already registered and skip the pipeline during hydration.
- The middleware reads the full response body, then injects the collected CSS into `</head>` before sending the final HTML.
- In extraction mode, prerendered responses also carry temporary structured
  artifact metadata. `astro:build:done` uses those collector-provided
  boundaries to write shared and page assets and rewrite generated HTML, then
  removes the metadata. Artifact boundaries are never inferred by splitting or
  reparsing the generated CSS.

### CSP nonce

Call `configure({ nonce: '...' })` before any rendering happens. The middleware reads the nonce and applies it to injected `<style>` and `<script>` tags. In extraction mode, the external stylesheet links retain the nonce.

---

## Generic Framework Integration

Any React-based framework can integrate using `runWithCollector`, which binds a `ServerStyleCollector` to the current async context via `AsyncLocalStorage`. All style function calls within the render automatically discover the collector.

```tsx
// ── Server ──────────────────────────────────────────────
import {
  createServerStyleCollector,
  runWithCollector,
} from '@tenphi/tasty/ssr';
import { renderToString } from 'react-dom/server';

const collector = createServerStyleCollector();

const html = runWithCollector(collector, () => renderToString(<App />));

const css = collector.getCSS();
const classNames = collector.getRenderedClassNames();

// Embed in your HTML template:
const fullHtml = `
  <html>
    <head>
      <style data-tasty-ssr>${css}</style>
      <script>(window.__TASTY__=window.__TASTY__||[]).push(${JSON.stringify(classNames)})</script>
    </head>
    <body>
      <div id="root">${html}</div>
    </body>
  </html>
`;
```

```tsx
// ── Client ──────────────────────────────────────────────
import { hydrateTastyClasses } from '@tenphi/tasty/ssr/client';
import { hydrateRoot } from 'react-dom/client';

hydrateTastyClasses(); // reads window.__TASTY__
hydrateRoot(document.getElementById('root'), <App />);
```

`@tenphi/tasty/ssr/client` is the browser half: it exports `hydrateTastyClasses()` and has no import side effects. A module shared by the server and the client can import `@tenphi/tasty/ssr` too. It is safe in a browser bundle, where there is no server collector to find, and only `runWithCollector()` throws there.

### Streaming SSR

For streaming with `renderToPipeableStream`, use `flushCSS()` instead of `getCSS()`:

```tsx
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';

const collector = createServerStyleCollector();

// React ends the stream it pipes into, so pipe into a PassThrough and
// append the remaining styles and the class list after it ends.
const body = new PassThrough();
body.pipe(res, { end: false });
body.on('end', () => {
  // Styles collected after the shell (Suspense boundaries) + class list
  const css = collector.flushCSS();
  if (css) res.write(`<style data-tasty-ssr>${css}</style>`);

  const classNames = collector.getRenderedClassNames();
  res.end(
    `</div><script>(window.__TASTY__=window.__TASTY__||[]).push(${JSON.stringify(classNames)})</script></body></html>`,
  );
});

runWithCollector(collector, () => {
  const { pipe } = renderToPipeableStream(<App />, {
    onShellReady() {
      // Styles collected for the shell
      const css = collector.flushCSS();
      res.write(
        `<!DOCTYPE html><html><head><style data-tasty-ssr>${css}</style></head><body><div id="root">`,
      );
      pipe(body);
    },
  });
});
```

---

## API Reference

### Entry points

| Import path                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tenphi/tasty/ssr`                                                                                                                                                                              | Core SSR API: `ServerStyleCollector`, `createServerStyleCollector`, `runWithCollector`, `getSSRCollector`, `hydrateTastyClasses`; types `ServerStyleArtifact`, `ServerStyleArtifactKind`. Safe to import in a browser bundle; `runWithCollector()` needs the server |
| `@tenphi/tasty/ssr/client`                                                                                                                                                                       | Browser-safe client hydration for any framework: `hydrateTastyClasses`, no import side effects                                                                                                                                                                      |
| `@tenphi/tasty/ssr/next`                                                                                                                                                                         | Next.js App Router: `TastyRegistry` component                                                                                                                                                                                                                       |
| `@tenphi/tasty/ssr/next-config`                                                                                                                                                                  | Next.js config wrapper: shared, content-hashed global stylesheet                                                                                                                                                                                                    |
| `@tenphi/tasty/ssr/astro`                                                                                                                                                                        | Astro: `tastyIntegration`, `tastyMiddleware`                                                                                                                                                                                                                        |
| `@tenphi/tasty/ssr/astro-client`                                                                                                                                                                 | Astro: client-side cache hydration (auto-injected by integration, or import manually)                                                                                                                                                                               |
| `@tenphi/tasty/ssr/astro-middleware`<br />`@tenphi/tasty/ssr/astro-middleware-static`<br />`@tenphi/tasty/ssr/astro-middleware-extract`<br />`@tenphi/tasty/ssr/astro-middleware-extract-static` | Astro: the middleware entrypoints `tastyIntegration()` registers via `addMiddleware()`. Exported so Astro can resolve them by specifier; you should not import them. For manual setups use `tastyMiddleware()`.                                                     |

### `ServerStyleCollector`

Server-safe style collector. One instance per request.

Constructor: `new ServerStyleCollector(namePrefix?)`, or use the `createServerStyleCollector(namePrefix?)` factory. The optional `namePrefix` overrides the value from `configure({ namePrefix })`; in normal usage you pass nothing and let the global config drive it. See [Configuration: Name prefix](configuration.md#name-prefix).

| Method                                     | Description                                                                                                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allocateClassName(cacheKey)`              | Allocate a deterministic, content-hashed class name for a cache key (e.g. `t1a2b3` with the default prefix). The same `cacheKey` always produces the same class name on server and client when both share the same `namePrefix`. Returns `{ className, isNewAllocation }`. |
| `collectChunk(cacheKey, className, rules)` | Record CSS rules for a chunk. Deduplicated by `cacheKey`.                                                                                                                                                                                                                  |
| `collectKeyframes(name, css)`              | Record a `@keyframes` rule. Deduplicated by name.                                                                                                                                                                                                                          |
| `allocateKeyframeName(providedName?)`      | Allocate a keyframe name. Returns `providedName` if given, otherwise generates one using `${namePrefix}k${counter}` (e.g. `tk0`, `tk1`, ...).                                                                                                                              |
| `collectProperty(name, css)`               | Record a `@property` rule. Deduplicated by name.                                                                                                                                                                                                                           |
| `collectFontFace(key, css)`                | Record a `@font-face` rule. Deduplicated by content hash.                                                                                                                                                                                                                  |
| `collectCounterStyle(name, css, options?)` | Record a `@counter-style` rule, keyed by name. A different rule under the same name replaces the earlier one (and is re-flushed when streaming); `{ weak: true }`, used for `configure()` definitions, never replaces.                                                     |
| `collectFunction(name, css, options?)`     | Record a CSS `@function` rule (from `useFunction` or `@function` styles). Same replace/`weak` semantics as `collectCounterStyle`.                                                                                                                                          |
| `allocateCounterStyleName(providedName?)`  | Allocate a counter-style name. Returns `providedName` if given, otherwise generates one using `${namePrefix}c${counter}` (e.g. `tc0`, `tc1`, ...).                                                                                                                         |
| `collectGlobalStyles(key, css)`            | Record global styles (from `useGlobalStyles`). Deduplicated by key.                                                                                                                                                                                                        |
| `collectRawCSS(key, css)`                  | Record raw CSS text (from `useRawCSS`). Deduplicated by key.                                                                                                                                                                                                               |
| `collectInternals()`                       | Collect eager configured globals: `@property`, `:root` tokens and presets, `@font-face`, `@counter-style`, `@function`, and `globalStyles`. Called automatically on first chunk collection; idempotent.                                                                    |
| `getCSS()`                                 | Get all collected CSS as a single string. For non-streaming SSR.                                                                                                                                                                                                           |
| `flushCSS()`                               | Get only CSS collected since the last flush. For streaming SSR.                                                                                                                                                                                                            |
| `getRenderedClassNames()`                  | Get the class names allocated since the previous call (the first call returns all so far). Push each batch to `window.__TASTY__` for hydration via `hydrateTastyClasses()`.                                                                                                |
| `getArtifacts()`                           | Return the collected CSS as ordered, typed artifacts (`property`, `font-face`, `counter-style`, `function`, `raw`, `global`, `chunk`, `keyframes`).                                                                                                                        |

### `TastyRegistry`

Next.js App Router component. Props:

| Prop               | Type              | Default   | Description                                                               |
| ------------------ | ----------------- | --------- | ------------------------------------------------------------------------- |
| `children`         | `ReactNode`       | required  | Application tree                                                          |
| `transferCache`    | `boolean`         | `true`    | Embed cache state script for zero-cost hydration                          |
| `sharedStylesheet` | `string \| false` | generated | Override the shared URL, or disable generated shared CSS for the registry |

### `withTastyNext(options)`

Next.js configuration wrapper exported from
`@tenphi/tasty/ssr/next-config`. It generates a shared stylesheet from eager
Tasty configuration artifacts and wires its URL and immutable cache header
into the Next config. Route-specific CSS continues through `TastyRegistry`.

### `tastyIntegration(options?)`

Astro integration factory. Registers middleware and optionally injects client hydration.

| Option    | Type                               | Default              | Description                                                                                                                                                      |
| --------- | ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `islands` | `boolean`                          | `true`               | When `true`, injects client hydration script and enables `transferCache`. When `false`, no client JS is shipped.                                                 |
| `css`     | `{ mode?: 'inline' \| 'extract' }` | `{ mode: 'inline' }` | `'extract'` writes content-hashed shared and per-page stylesheets for prerendered pages (Astro 5+). See [Build-wide CSS extraction](#build-wide-css-extraction). |

### `tastyMiddleware(options?)`

Astro middleware factory. Use for manual middleware composition.

| Option          | Type      | Default | Description                                   |
| --------------- | --------- | ------- | --------------------------------------------- |
| `transferCache` | `boolean` | `true`  | Embed cache state script for island hydration |

### `hydrateTastyClasses(classes?)`

Exported from `@tenphi/tasty/ssr/client` and `@tenphi/tasty/ssr`. Pre-populate the client injector's rules map with class names rendered on the server, marking them as already present in the DOM so `computeStyles()` skips re-injection during hydration. When called without arguments, reads the class list from `window.__TASTY__` (populated by the streaming `<script>` tags emitted during SSR).

### `runWithCollector(collector, fn)`

Run a function with a `ServerStyleCollector` bound to the current async context via `AsyncLocalStorage`. All style function calls within `fn` (and async continuations) — including `computeStyles()`, `useStyles()`, `useGlobalStyles()`, `useRawCSS()`, `useKeyframes()`, `useProperty()`, `useFontFace()`, `useCounterStyle()`, and `useFunction()` — will find this collector. Returns `fn`'s return value, synchronously unless `fn` returns a promise. Throws where `AsyncLocalStorage` is unavailable, such as in a browser.

---

## Troubleshooting

### Styles flash on page load (FOUC)

The `TastyRegistry` or `tastyIntegration` is missing. Ensure your layout wraps the app with `TastyRegistry` (Next.js) or that `tastyIntegration()` is in your Astro config (or `tastyMiddleware()` is registered manually).

### Hydration mismatch warnings

Class names are content hashes of the resolved styles, so render order does not affect them. Unnamed `useKeyframes()` and `useCounterStyle()` names are counters (`tk0`, `tc0`) on both server and client; pass `name` if the two sides can call them in a different order. If you see mismatches, ensure `hydrateTastyClasses()` runs before React hydration. For Next.js, this is automatic. For Astro with `tastyIntegration()`, this is also automatic. For manual Astro middleware setups, import `@tenphi/tasty/ssr/astro-client` in your island components. For custom setups, call `hydrateTastyClasses()` from `@tenphi/tasty/ssr/client` before `hydrateRoot()`.

Class names are also derived from the _resolved_ styles, so the server and the client must configure Tasty identically. Anything that changes what a component's styles resolve to will produce a mismatch if it is registered on only one side — `namePrefix`, `recipes`, `handlers`, and the `propHandlers` / `baseStyleProps` extension points described in [Plugins](plugins.md). Call the same `configure()` on both; global CSS is deduplicated automatically, so no `typeof window` guard is needed.

### Styles duplicated after hydration

**Global CSS** (`:root` tokens, `@property`, `globalStyles`, `@font-face`, `@counter-style`, `@function`) configured via `configure()` is automatically deduplicated. When Tasty detects an inline or extracted `[data-tasty-ssr]` stylesheet in the document, it skips client-side injection of globals that were already rendered by the SSR collector. This means `configure()` can be called with the full config on both server and client — no `typeof window === 'undefined'` guard is needed.

**Component CSS**: SSR `<style data-tasty-ssr>` tags remain in the DOM. The client injector creates separate `<style>` elements for any new styles. SSR styles are never modified or removed by the client. If this is a concern for very large apps, you can remove the SSR style tags and hydration scripts manually after hydration:

```tsx
import { hydrateTastyClasses } from '@tenphi/tasty/ssr/client';

hydrateTastyClasses();
hydrateRoot(root, <App />);

// Optional: remove SSR style tags and class-list scripts after hydration
document.querySelectorAll('style[data-tasty-ssr]').forEach((el) => el.remove());
document.querySelectorAll('script').forEach((el) => {
  if (el.textContent?.includes('__TASTY__')) el.remove();
});
```

### `AsyncLocalStorage` not available

`runWithCollector()` throws `runWithCollector() needs AsyncLocalStorage from node:async_hooks` where the runtime has no `AsyncLocalStorage`, such as in a browser bundle. Call it on the server. The rest of `@tenphi/tasty/ssr` is safe to import in a browser bundle; on the client, call `hydrateTastyClasses()` from `@tenphi/tasty/ssr/client`, or use `@tenphi/tasty/ssr/next`, which hydrates automatically.

### "Server rendering without a style collector" warning

Tasty rendered on the server with no collector and no React Server Components request scope: Astro without `tastyIntegration()`, a client component server-rendered without `TastyRegistry`, or a custom setup that skips `runWithCollector()`. Each `tasty()` element then inlines all of its CSS, and configured globals (tokens, the default `@property` set, `globalStyles`, `@font-face`) and the CSS of the standalone style functions are not emitted. Add the integration for your framework. The warning is shown once, in development only.
