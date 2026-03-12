# Server-Side Rendering (SSR)

Tasty supports server-side rendering with zero-cost client hydration. Your existing `tasty()` components work unchanged -- SSR is opt-in and requires no per-component modifications.

**Requires React 19+.**

---

## How It Works

During server rendering, `useStyles()` detects a `ServerStyleCollector` and collects CSS into it instead of trying to access the DOM. The collector accumulates all styles, serializes them as `<style>` tags and a cache state script in the HTML. On the client, `hydrateTastyCache()` pre-populates the injector cache so that `useStyles()` skips the rendering pipeline entirely during hydration.

```
Server                         Client
──────                         ──────
tasty() renders                hydrateTastyCache() pre-populates cache
  └─ useStyles()                 └─ cacheKey → className map ready
       └─ collector.collect()
                                 tasty() renders
After render:                    └─ useStyles()
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

- `TastyRegistry` is a `'use client'` component, but Next.js still server-renders it on initial page load.
- During SSR, `useStyles()` finds the collector via React context and pushes CSS rules to it.
- `TastyRegistry` uses `useServerInsertedHTML` to flush collected CSS into the HTML stream as `<style data-tasty-ssr>` tags. This is fully streaming-compatible -- styles are injected alongside each Suspense boundary as it resolves.
- A companion `<script>` tag transfers the `cacheKey → className` mapping to the client.
- When the module loads on the client, `hydrateTastyCache()` runs automatically and pre-populates the injector cache. During hydration, `useStyles()` hits the cache and skips the entire pipeline.

### Using tasty() in Server Components

`tasty()` components use React hooks internally, so they require `'use client'`. However, this does **not** prevent them from being used in Server Component pages. In Next.js, `'use client'` components are still server-rendered on initial load. Dynamic `styleProps` like `<Grid flow="column">` work normally when a `tasty()` component is imported into a Server Component page.

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

### 1. Add the middleware

Create or update your Astro middleware:

```ts
// src/middleware.ts
import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';

export const onRequest = tastyMiddleware();
```

### 2. Use tasty() components as normal

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
    <Card>Static card — styles collected by middleware</Card>
    <Card client:load>Island card — styles hydrated on client</Card>
  </body>
</html>
```

### How it works

Astro's `@astrojs/react` renderer calls `renderToString()` for each React component without wrapping the tree in a provider. The middleware uses `AsyncLocalStorage` to make the collector available to all `useStyles()` calls within the request.

- **Static components** (no `client:*`): Styles are collected during `renderToString` and injected into `</head>`. No JavaScript is shipped for these components.
- **Islands** (`client:load`, `client:visible`, etc.): Styles are collected during SSR the same way. On the client, importing `@tenphi/tasty/ssr/astro` auto-hydrates the cache from `<script data-tasty-cache>`. The island's `useStyles()` calls hit the cache during hydration.

### Client-side hydration for islands

The `@tenphi/tasty/ssr/astro` module auto-hydrates when imported on the client. To ensure the cache is warm before any island renders, import it in a shared entry point or in each island component:

```tsx
// src/components/MyIsland.tsx
import '@tenphi/tasty/ssr/astro'; // auto-hydrates cache on import
import { tasty } from '@tenphi/tasty';

const MyIsland = tasty({
  styles: { padding: '2x', fill: '#blue' },
});

export default MyIsland;
```

### Options

```ts
// Skip cache state transfer
export const onRequest = tastyMiddleware({ transferCache: false });
```

### CSP nonce

Same as Next.js -- call `configure({ nonce: '...' })` before any rendering happens. The middleware reads the nonce and applies it to injected tags.

---

## Generic Framework Integration

Any React-based framework can integrate using the core SSR API:

```tsx
import {
  ServerStyleCollector,
  TastySSRContext,
  hydrateTastyCache,
} from '@tenphi/tasty/ssr';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

// ── Server ──────────────────────────────────────────────

const collector = new ServerStyleCollector();

const html = renderToString(
  <TastySSRContext.Provider value={collector}>
    <App />
  </TastySSRContext.Provider>
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

const stream = renderToPipeableStream(
  <TastySSRContext.Provider value={collector}>
    <App />
  </TastySSRContext.Provider>,
  {
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
  }
);
```

### AsyncLocalStorage (no React context)

If your framework doesn't support wrapping the React tree with a provider, use `runWithCollector`:

```tsx
import {
  ServerStyleCollector,
  runWithCollector,
  hydrateTastyCache,
} from '@tenphi/tasty/ssr';

const collector = new ServerStyleCollector();

const html = await runWithCollector(collector, () =>
  renderToString(<App />)
);

const css = collector.getCSS();
// ... inject into HTML as above
```

---

## API Reference

### Entry points

| Import path | Description |
|---|---|
| `@tenphi/tasty/ssr` | Core SSR API: `ServerStyleCollector`, `TastySSRContext`, `runWithCollector`, `hydrateTastyCache` |
| `@tenphi/tasty/ssr/next` | Next.js App Router: `TastyRegistry` component |
| `@tenphi/tasty/ssr/astro` | Astro: `tastyMiddleware`, auto-hydration on import |

### `ServerStyleCollector`

Server-safe style collector. One instance per request.

| Method | Description |
|---|---|
| `allocateClassName(cacheKey)` | Allocate a sequential class name (`t0`, `t1`, ...) for a cache key. Returns `{ className, isNewAllocation }`. |
| `collectChunk(cacheKey, className, rules)` | Record CSS rules for a chunk. Deduplicated by `cacheKey`. |
| `collectKeyframes(name, css)` | Record a `@keyframes` rule. Deduplicated by name. |
| `collectProperty(name, css)` | Record a `@property` rule. Deduplicated by name. |
| `getCSS()` | Get all collected CSS as a single string. For non-streaming SSR. |
| `flushCSS()` | Get only CSS collected since the last flush. For streaming SSR. |
| `getCacheState()` | Serialize `{ entries: Record<cacheKey, className>, classCounter }` for client hydration. |

### `TastySSRContext`

React context (`createContext<ServerStyleCollector | null>(null)`). Used by `useStyles()` to find the collector during SSR.

### `TastyRegistry`

Next.js App Router component. Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | required | Application tree |
| `transferCache` | `boolean` | `true` | Embed cache state script for zero-cost hydration |

### `tastyMiddleware(options?)`

Astro middleware factory. Options:

| Option | Type | Default | Description |
|---|---|---|---|
| `transferCache` | `boolean` | `true` | Embed cache state script for island hydration |

### `hydrateTastyCache(state?)`

Pre-populate the client injector cache. When called without arguments, reads from `window.__TASTY_SSR_CACHE__` (streaming) or `<script data-tasty-cache>` (non-streaming).

### `runWithCollector(collector, fn)`

Run a function with a `ServerStyleCollector` bound to the current async context via `AsyncLocalStorage`. All `useStyles()` calls within `fn` (and async continuations) will find this collector.

---

## Troubleshooting

### Styles flash on page load (FOUC)

The `TastyRegistry` or `tastyMiddleware` is missing. Ensure your layout wraps the app with `TastyRegistry` (Next.js) or the middleware is registered (Astro).

### Hydration mismatch warnings

Class names are deterministic for the same render order. If you see mismatches, ensure `hydrateTastyCache()` runs before React hydration. For Next.js, this is automatic. For Astro, import `@tenphi/tasty/ssr/astro` in your island components. For custom setups, call `hydrateTastyCache()` before `hydrateRoot()`.

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
