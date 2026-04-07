# Server-Side Rendering (SSR)

Tasty supports server-side rendering with zero-cost client hydration. This does **not** introduce a separate styling engine: SSR uses the same runtime `tasty()` pipeline you already use on the client, then adds server-side CSS collection and client-side cache hydration. Your existing `tasty()` components work unchanged, and SSR remains opt-in with no per-component modifications. For the broader docs map, see the [Docs Hub](README.md).

---

## Requirements

| Dependency | Version | Required for |
|---|---|---|
| `react` | >= 18 | All SSR entry points (matches the current peer dependency of `@tenphi/tasty`) |
| `next` | >= 13 | Next.js integration (`@tenphi/tasty/ssr/next`) — App Router with `useServerInsertedHTML` |
| Node.js | >= 20 | Generic / streaming SSR (`@tenphi/tasty/ssr`) — uses `node:async_hooks` for `AsyncLocalStorage` |

The Astro integration (`@tenphi/tasty/ssr/astro`) has no additional dependencies beyond `react`.

---

## How It Works

`tasty()` components are hook-free and use `computeStyles()` internally — a synchronous, framework-agnostic function. On the server, `computeStyles()` detects a `ServerStyleCollector` (via `AsyncLocalStorage` or an explicit option) and collects CSS into it instead of trying to access the DOM. On the client, CSS is injected synchronously into the DOM during render; the injector's content-based cache makes this idempotent. The collector accumulates all styles, serializes them as `<style>` tags and a cache state script in the HTML. On the client, `hydrateTastyCache()` pre-populates the injector cache so that `computeStyles()` skips the rendering pipeline entirely during hydration.

```
Server                         Client
──────                         ──────
tasty() renders                hydrateTastyCache() pre-populates cache
  └─ computeStyles()              └─ cacheKey → className map ready
       └─ collector.collect()
                                 tasty() renders
After render:                    └─ computeStyles()
  <style data-tasty-ssr>              └─ cache hit → skip pipeline
  <script data-tasty-cache>           └─ no CSS re-injection
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

### How it works

- `TastyRegistry` is a `'use client'` component, but Next.js still server-renders it on initial page load. The `'use client'` boundary is required solely to access `useServerInsertedHTML` — **not** because `tasty()` components need the client.
- During SSR, `TastyRegistry` creates a `ServerStyleCollector` and registers it via a module-level global getter. All style functions — `tasty()` components, `computeStyles()`, `useStyles()`, `useGlobalStyles()`, `useRawCSS()`, `useKeyframes()`, `useProperty()`, `useFontFace()`, and `useCounterStyle()` — discover the collector through this single global getter. No React context is involved.
- `TastyRegistry` uses `useServerInsertedHTML` to flush collected CSS into the HTML stream as `<style data-tasty-ssr>` tags. This is fully streaming-compatible — styles are injected alongside each Suspense boundary as it resolves.
- A companion `<script>` tag transfers the `cacheKey → className` mapping to the client.
- When the module loads on the client, `hydrateTastyCache()` runs automatically and pre-populates the injector cache. During hydration, `computeStyles()` hits the cache and skips the entire pipeline.

### Using Tasty in Server Components

All Tasty style functions are hook-free and do not require `'use client'`. They can be used directly in React Server Components:

- `tasty()` components — dynamic `styleProps` like `<Grid flow="column">` work normally
- `useStyles()`, `useGlobalStyles()`, `useRawCSS()` — inject styles by class or selector
- `useKeyframes()`, `useProperty()`, `useFontFace()`, `useCounterStyle()` — inject ancillary CSS rules

During SSR, all functions discover the collector via the same global getter registered by `TastyRegistry` — no React context or client boundary needed. In RSC mode without a collector (e.g., Astro zero-setup), CSS is accumulated in a per-request cache and flushed into an inline `<style>` tag by the next `tasty()` component in the tree. Ensure at least one `tasty()` component is present in every RSC render tree — standalone style functions alone cannot emit their CSS without a `tasty()` component to trigger the flush.

### Options

```tsx
// Skip cache state transfer (saves payload size at the cost of hydration perf)
<TastyRegistry transferCache={false}>{children}</TastyRegistry>
```

### CSP nonce

If your app uses Content Security Policy with nonces, configure it before rendering:

```tsx
// app/layout.tsx or a server-side init file
import { configure } from '@tenphi/tasty';

configure({ nonce: 'your-nonce-value' });
```

The nonce is automatically applied to all `<style>` and `<script>` tags injected by `TastyRegistry`.

---

## Astro

Tasty offers three levels of Astro integration. Choose the one that matches your needs:

| Setup | Config needed | Deduplication | Hooks work | Client JS |
|---|---|---|---|---|
| Zero setup | None | Per render tree | No | None |
| `tastyIntegration({ islands: false })` | One line | Cross-tree | Yes | None |
| `tastyIntegration()` | One line | Cross-tree | Yes | Auto-hydration |

### Zero setup (static pages)

`tasty()` components work in Astro with **no configuration**. Each component emits its own inline `<style>` tag during server rendering via the RSC inline path. Just import and use:

```tsx
// src/components/Card.tsx
import { tasty } from '@tenphi/tasty';

const Card = tasty({
  styles: {
    padding: '4x',
    fill: '#surface',
    radius: '1r',
    border: true,
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

**Trade-offs**: Styles are deduplicated within each React render tree, but Astro renders separate component trees independently, so shared CSS (tokens, `@property` rules) may appear more than once. All style functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`) work in zero-setup mode — their CSS is accumulated in the RSC cache and flushed by the next `tasty()` component in the tree.

Best for quick prototyping, small static sites, or trying Tasty out in Astro.

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
- A `<script data-tasty-cache>` tag with the `cacheKey -> className` map for client hydration
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
    <Card>Static -- styles in <style data-tasty-ssr></Card>
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

This gives the same middleware deduplication and hook support, but ships zero client-side JavaScript. No `<script data-tasty-cache>` is emitted.

### Manual middleware (advanced)

If you need to compose Tasty's middleware with other middleware (e.g., via `sequence()`), use `tastyMiddleware()` directly:

```ts
// src/middleware.ts
import { sequence } from 'astro:middleware';
import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';

export const onRequest = sequence(
  tastyMiddleware(),
  myOtherMiddleware,
);
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

### How it works

Astro's `@astrojs/react` renderer calls `renderToString()` for each React component without wrapping the tree in a provider. The middleware creates a `ServerStyleCollector` and binds it via `AsyncLocalStorage`. All `computeStyles()` calls within the request discover this collector automatically.

- **Static components** (no `client:*`): Styles are collected during `renderToString` and injected into `</head>` as a single `<style>` tag. No JavaScript is shipped.
- **Islands** (`client:load`, `client:visible`, etc.): Styles are collected during SSR the same way. On the client, the hydration script (auto-injected by `tastyIntegration()` or manually via `@tenphi/tasty/ssr/astro-client`) reads the cache state from `<script data-tasty-cache>` and pre-populates the injector. The island's `computeStyles()` calls hit the cache during hydration.
- The middleware uses streaming-compatible `TransformStream` processing to inject CSS into the response without buffering the entire HTML.

### CSP nonce

Call `configure({ nonce: '...' })` before any rendering happens. The middleware reads the nonce and applies it to injected `<style>` and `<script>` tags.

---

## Generic Framework Integration

Any React-based framework can integrate using `runWithCollector`, which binds a `ServerStyleCollector` to the current async context via `AsyncLocalStorage`. All style function calls within the render automatically discover the collector.

```tsx
import {
  ServerStyleCollector,
  runWithCollector,
  hydrateTastyCache,
} from '@tenphi/tasty/ssr';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

// ── Server ──────────────────────────────────────────────

const collector = new ServerStyleCollector();

const html = await runWithCollector(collector, () =>
  renderToString(<App />)
);

const css = collector.getCSS();
const cacheState = collector.getCacheState();

// Embed in your HTML template:
const fullHtml = `
  <html>
    <head>
      <style data-tasty-ssr>${css}</style>
      <script data-tasty-cache type="application/json">
        ${JSON.stringify(cacheState)}
      </script>
    </head>
    <body>
      <div id="root">${html}</div>
    </body>
  </html>
`;

// ── Client ──────────────────────────────────────────────

// Before hydration:
hydrateTastyCache(); // reads from <script data-tasty-cache>

hydrateRoot(document.getElementById('root'), <App />);
```

### Streaming SSR

For streaming with `renderToPipeableStream`, use `flushCSS()` instead of `getCSS()`:

```tsx
const collector = new ServerStyleCollector();

const stream = await runWithCollector(collector, () =>
  renderToPipeableStream(<App />, {
    onShellReady() {
      // Flush styles collected so far
      const css = collector.flushCSS();
      res.write(`<style data-tasty-ssr>${css}</style>`);
      stream.pipe(res);
    },
    onAllReady() {
      // Flush any remaining styles + cache state
      const css = collector.flushCSS();
      if (css) res.write(`<style data-tasty-ssr>${css}</style>`);

      const state = collector.getCacheState();
      res.write(`<script data-tasty-cache type="application/json">${JSON.stringify(state)}</script>`);
    },
  })
);
```

---

## API Reference

### Entry points

| Import path | Description |
|---|---|
| `@tenphi/tasty/ssr` | Core SSR API: `ServerStyleCollector`, `runWithCollector`, `hydrateTastyCache` |
| `@tenphi/tasty/ssr/next` | Next.js App Router: `TastyRegistry` component |
| `@tenphi/tasty/ssr/astro` | Astro: `tastyIntegration`, `tastyMiddleware` |
| `@tenphi/tasty/ssr/astro-client` | Astro: client-side cache hydration (auto-injected by integration, or import manually) |

### `ServerStyleCollector`

Server-safe style collector. One instance per request.

| Method | Description |
|---|---|
| `allocateClassName(cacheKey)` | Allocate a sequential class name (`t0`, `t1`, ...) for a cache key. Returns `{ className, isNewAllocation }`. |
| `collectChunk(cacheKey, className, rules)` | Record CSS rules for a chunk. Deduplicated by `cacheKey`. |
| `collectKeyframes(name, css)` | Record a `@keyframes` rule. Deduplicated by name. |
| `collectProperty(name, css)` | Record a `@property` rule. Deduplicated by name. |
| `collectFontFace(key, css)` | Record a `@font-face` rule. Deduplicated by content hash. |
| `collectCounterStyle(name, css)` | Record a `@counter-style` rule. Deduplicated by name. |
| `getCSS()` | Get all collected CSS as a single string. For non-streaming SSR. |
| `flushCSS()` | Get only CSS collected since the last flush. For streaming SSR. |
| `getCacheState()` | Serialize `{ entries: Record<cacheKey, className>, classCounter }` for client hydration. |

### `TastyRegistry`

Next.js App Router component. Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | required | Application tree |
| `transferCache` | `boolean` | `true` | Embed cache state script for zero-cost hydration |

### `tastyIntegration(options?)`

Astro integration factory. Registers middleware and optionally injects client hydration.

| Option | Type | Default | Description |
|---|---|---|---|
| `islands` | `boolean` | `true` | When `true`, injects client hydration script and enables `transferCache`. When `false`, no client JS is shipped. |

### `tastyMiddleware(options?)`

Astro middleware factory. Use for manual middleware composition.

| Option | Type | Default | Description |
|---|---|---|---|
| `transferCache` | `boolean` | `true` | Embed cache state script for island hydration |

### `hydrateTastyCache(state?)`

Pre-populate the client injector cache. When called without arguments, reads from `window.__TASTY_SSR_CACHE__` (streaming) or `<script data-tasty-cache>` (non-streaming).

### `runWithCollector(collector, fn)`

Run a function with a `ServerStyleCollector` bound to the current async context via `AsyncLocalStorage`. All style function calls within `fn` (and async continuations) — including `computeStyles()`, `useStyles()`, `useGlobalStyles()`, `useRawCSS()`, `useKeyframes()`, `useProperty()`, `useFontFace()`, and `useCounterStyle()` — will find this collector.

---

## Troubleshooting

### Styles flash on page load (FOUC)

The `TastyRegistry` or `tastyIntegration` is missing. Ensure your layout wraps the app with `TastyRegistry` (Next.js) or that `tastyIntegration()` is in your Astro config (or `tastyMiddleware()` is registered manually).

### Hydration mismatch warnings

Class names are deterministic for the same render order. If you see mismatches, ensure `hydrateTastyCache()` runs before React hydration. For Next.js, this is automatic. For Astro with `tastyIntegration()`, this is also automatic. For manual Astro middleware setups, import `@tenphi/tasty/ssr/astro-client` in your island components. For custom setups, call `hydrateTastyCache()` before `hydrateRoot()`.

### Styles duplicated after hydration

This is expected and harmless. SSR `<style data-tasty-ssr>` tags remain in the DOM. The client injector creates separate `<style>` elements for any new styles. SSR styles are never modified or removed by the client. If this is a concern for very large apps, call `cleanupSSRStyles()` after hydration:

```tsx
import { hydrateTastyCache } from '@tenphi/tasty/ssr';

hydrateTastyCache();
hydrateRoot(root, <App />);

// Optional: remove SSR style tags after hydration
document.querySelectorAll('style[data-tasty-ssr]').forEach(el => el.remove());
document.querySelectorAll('script[data-tasty-cache]').forEach(el => el.remove());
```

### `AsyncLocalStorage` not available

The `@tenphi/tasty/ssr` entry point imports from `node:async_hooks`. This is excluded from client bundles by the build configuration. If you see import errors on the client, ensure your bundler treats `node:async_hooks` as external or use the `@tenphi/tasty/ssr/next` entry point (which does not use ALS).
