# Tasty Debug Utilities

Runtime CSS inspection and diagnostics for the Tasty styling system. Inspect injected styles, measure cache performance, analyze style chunks, and troubleshoot CSS issues — all from the browser console.

---

## Overview

`tastyDebug` is a diagnostic object that exposes Tasty's runtime CSS state. It is designed for development use but can be manually installed in production for debugging.

In development mode (`isDevEnv()` returns `true`), `tastyDebug` is automatically installed on `window.tastyDebug`. In production, install it manually when needed.

All methods **log to the console by default**. Pass `{ raw: true }` to suppress logging and only return data.

---

## Quick Start

```typescript
// Auto-installed in dev mode. Otherwise:
import { tastyDebug } from '@tenphi/tasty';
tastyDebug.install();

// Print a quick-start guide
tastyDebug.help();

// Get a comprehensive overview (logged automatically)
tastyDebug.summary();

// See all active CSS
tastyDebug.css('active');

// Inspect a specific element
tastyDebug.inspect('.my-button');

// Silent mode — return data only, no console output
const data = tastyDebug.summary({ raw: true });
```

---

## Options

All methods accept a shared options object:

```typescript
interface DebugOptions {
  root?: Document | ShadowRoot; // Target root (default: document)
  raw?: boolean;                // Suppress console logging (default: false)
}
```

When `raw` is `false` (the default), results are logged to the console **and** returned. When `raw` is `true`, results are returned silently.

---

## API Reference

### `css(target, opts?): string`

Retrieves CSS text for a given target. Logs the result with rule count and size.

**Targets:**

| Target | Description |
|---|---|
| `'all'` | All tasty CSS (component + global + raw) |
| `'active'` | CSS for classes currently in the DOM |
| `'unused'` | CSS with refCount = 0 (cached but not used) |
| `'global'` | Only global CSS (from `injectGlobal`) |
| `'page'` | All CSS on the page (including non-tasty) |
| `'t42'` | CSS for a specific tasty class |
| `['t0', 't5']` | CSS for multiple tasty classes |
| `'.my-button'` | CSS affecting a DOM element (by selector) |
| `element` | CSS affecting a DOM element (by reference) |

**Extra options:**

```typescript
interface CssOptions extends DebugOptions {
  prettify?: boolean; // Format output (default: true)
  source?: boolean;   // Read original CSS instead of live CSSOM (default: false, dev-mode only)
}
```

```typescript
// Active CSS with stats
tastyDebug.css('active');

// Specific class, silent
const css = tastyDebug.css('t42', { raw: true });

// Compare original vs browser-parsed CSS (dev mode only)
tastyDebug.css('t42');                    // live CSSOM
tastyDebug.css('t42', { source: true }); // original output

// Shadow DOM
tastyDebug.css('all', { root: shadowRoot });
```

The `source` option reads from `RuleInfo.cssText`, which is only populated when `devMode` is active (development environment or `localStorage.TASTY_DEBUG = 'true'`). In production without debug mode, it falls back to the live CSSOM with a warning.

---

### `inspect(target, opts?): InspectResult`

Inspects a DOM element and returns detailed information about its tasty styles, including chunk assignments.

```typescript
interface InspectResult {
  element?: Element | null;
  classes: string[];    // Tasty classes on the element
  chunks: ChunkInfo[];  // Chunk assignment per class
  css: string;          // Prettified CSS
  size: number;         // CSS size in characters
  rules: number;        // Number of CSS rule blocks
}

interface ChunkInfo {
  className: string;
  chunkName: string | null; // e.g., 'appearance', 'font', 'dimension'
}
```

```typescript
tastyDebug.inspect('.my-card');
// Logs: inspect div — 3 classes, 5 rules, 1.2KB
//       Chunks: t3→appearance, t7→font, t12→dimension

// Silent
const result = tastyDebug.inspect('.my-card', { raw: true });
console.log(result.classes);  // ['t3', 't7', 't12']
console.log(result.rules);    // 5
```

---

### `summary(opts?): Summary`

One-shot overview of the entire Tasty CSS state. Logs a compact report.

```typescript
interface Summary {
  activeClasses: string[];
  unusedClasses: string[];
  totalStyledClasses: string[];

  activeCSSSize: number;
  unusedCSSSize: number;
  globalCSSSize: number;
  rawCSSSize: number;
  keyframesCSSSize: number;
  propertyCSSSize: number;
  totalCSSSize: number;

  activeRuleCount: number;
  unusedRuleCount: number;
  globalRuleCount: number;
  rawRuleCount: number;
  keyframesRuleCount: number;
  propertyRuleCount: number;
  totalRuleCount: number;

  metrics: CacheMetrics | null;
  definedProperties: string[];
  definedKeyframes: { name: string; refCount: number }[];
  chunkBreakdown: ChunkBreakdown;
}
```

```typescript
// Logged automatically
tastyDebug.summary();
// Output:
//   Active:   42 classes, 186 rules, 12.4KB
//   Unused:   3 classes, 8 rules, 0.5KB
//   Global:   12 rules, 1.1KB
//   Total:    45 classes, 206 rules, 14.0KB
//   Cache:    94.2% hit rate (312 lookups)

// Silent
const s = tastyDebug.summary({ raw: true });
console.log(s.totalRuleCount); // 206
```

---

### `chunks(opts?): ChunkBreakdown`

Breakdown of styles by chunk type.

```typescript
interface ChunkBreakdown {
  byChunk: Record<string, {
    classes: string[];
    cssSize: number;
    ruleCount: number;
  }>;
  totalChunkTypes: number;
  totalClasses: number;
}
```

```typescript
tastyDebug.chunks();
// Output:
//   appearance: 24 cls, 48 rules, 3.2KB
//   font: 18 cls, 18 rules, 1.1KB
//   dimension: 31 cls, 45 rules, 2.4KB
```

Chunk types: `combined`, `appearance`, `font`, `dimension`, `display`, `layout`, `position`, `misc`, `subcomponents`.

---

### `cache(opts?): CacheStatus`

Cache state and performance metrics.

```typescript
interface CacheStatus {
  classes: {
    active: string[];
    unused: string[];
    all: string[];
  };
  metrics: CacheMetrics | null;
}
```

```typescript
tastyDebug.cache();
// Output:
//   Active: 42, Unused: 3
//   Hits: 294, Misses: 18, Rate: 94.2%
```

---

### `cleanup(opts?): void`

Forces immediate cleanup of all unused styles (those with `refCount = 0`).

```typescript
tastyDebug.cleanup();
tastyDebug.cleanup({ root: shadowRoot });
```

---

### `help(): void`

Prints a quick-start guide to the console.

```typescript
tastyDebug.help();
```

---

### `install(): void`

Attaches `tastyDebug` to `window.tastyDebug`. Called automatically in development mode.

```typescript
import { tastyDebug } from '@tenphi/tasty';
tastyDebug.install();
```

---

## Shadow DOM Support

All methods accept a `root` option to target a Shadow DOM:

```typescript
const shadowRoot = host.shadowRoot;
tastyDebug.css('all', { root: shadowRoot });
tastyDebug.inspect('.shadow-component', { root: shadowRoot });
tastyDebug.summary({ root: shadowRoot });
```

---

## Common Workflows

### Debugging a component's styles

```typescript
// 1. Inspect the element
tastyDebug.inspect('.my-button');

// 2. See CSS for a specific class
tastyDebug.css('t3');

// 3. Compare original vs browser-parsed (dev mode)
tastyDebug.css('t3', { source: true });
```

### Checking cache efficiency

```typescript
const { metrics } = tastyDebug.cache({ raw: true });
if (metrics) {
  const total = metrics.hits + metrics.misses;
  const rate = total > 0 ? ((metrics.hits / total) * 100).toFixed(1) : 0;
  console.log(`Cache hit rate: ${rate}%`);
}
```

### Monitoring CSS growth

```typescript
const s = tastyDebug.summary({ raw: true });
console.log(`Total: ${s.totalRuleCount} rules, ${(s.totalCSSSize / 1024).toFixed(1)}KB`);
console.log(`Active: ${s.activeRuleCount} rules`);
console.log(`Unused: ${s.unusedRuleCount} rules`);
```
