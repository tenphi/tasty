# Tasty Style Injector

A high-performance CSS-in-JS solution that powers the Tasty design system with efficient style injection, automatic cleanup, and first-class SSR support.

---

## Overview

The Style Injector is the core engine behind Tasty's styling system, providing:

- **Hash-based deduplication** - Identical CSS gets the same className
- **DOM-driven lifetime** - Styles are collected once nothing renders them
- **CSS nesting flattening** - Handles `&`, `.Class`, `SubElement` patterns
- **At-rule injection** - First-class `@keyframes`, `@property`, `@font-face`, `@counter-style`, and `@function` support
- **Smart cleanup** - CSS rules batched cleanup, keyframes disposed immediately
- **SSR support** - Deterministic class names and CSS extraction
- **Multiple roots** - Works with Document and ShadowRoot
- **Non-stacking cleanups** - Prevents timeout accumulation for better performance

> **Note:** This is internal infrastructure that powers Tasty components. Most developers will interact with the higher-level `tasty()` API instead.

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   tasty()       │────│  Style Injector  │────│  Sheet Manager  │
│   components    │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Style Results  │    │ Keyframes Manager│    │  Root Registry  │
│  (CSS rules)    │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                            │
         │                                            │
         ▼                                            ▼
┌─────────────────┐                             ┌─────────────────┐
│   Hash Cache    │                             │ <style> elements│
│   Deduplication │                             │ CSSStyleSheet   │
└─────────────────┘                             └─────────────────┘
```

---

## Core API

### `inject(rules, options?): InjectResult`

Injects CSS rules and returns a className with dispose function.

```typescript
import { inject } from '@tenphi/tasty';

// Component styling - generates tasty class names
const result = inject([{
  selector: '.t-abc123',
  declarations: 'color: red; padding: 10px;',
}]);

console.log(result.className); // 't-abc123'

// Release the pin; the class becomes collectible once nothing renders it
result.dispose();
```

`inject()` **pins** the class it returns, and `gc()` never evicts a pinned class
— that is what `dispose()` releases. Pass `{ pin: false }` when the caller keeps
no handle and the DOM is the only record that the class is in use; `dispose()`
is then a no-op. The render path (`tasty()` / `computeStyles()`) injects this
way, because a hook-free render has no unmount signal to dispose on.

### `injectGlobal(rules, options?): { dispose: () => void }`

Injects global styles that don't reserve tasty class names.

```typescript
// Global styles - for body, resets, etc.
const globalResult = injectGlobal([
  {
    selector: 'body',
    declarations: 'margin: 0; font-family: Arial;',
  },
  {
    selector: '.header',
    declarations: 'background: blue; color: white;',
    atRules: ['@media (min-width: 768px)'],
  }
]);

// Only returns dispose function - no className needed for global styles
globalResult.dispose();
```

### `injectRawCSS(css, options?): { dispose: () => void }`

Injects raw CSS text directly without parsing. This is a low-overhead method for injecting CSS that doesn't need tasty processing.

```typescript
import { injectRawCSS } from '@tenphi/tasty';

// Inject raw CSS
const { dispose } = injectRawCSS(`
  body {
    margin: 0;
    padding: 0;
    font-family: sans-serif;
  }
  
  .my-class {
    color: red;
  }
`);

// Later, remove the injected CSS
dispose();
```

### `useRawCSS(css, options?)` or `useRawCSS(factory, deps, options?)`

Inject raw CSS without parsing. Hook-free — works in client components, SSR, and React Server Components.

Supports two overloads:
- **Static CSS**: `useRawCSS(cssString, options?)` — content-based deduplication
- **Factory function**: `useRawCSS(() => cssString, deps, options?)` — factory called on every invocation, dedup handled internally

Use the `id` option for update tracking — when the CSS changes for the same id, the previous injection is replaced:

```tsx
import { useRawCSS } from '@tenphi/tasty';

// Static CSS
function GlobalReset() {
  useRawCSS(`
    body { margin: 0; padding: 0; }
  `);
  return null;
}

// Dynamic CSS with factory function and update tracking
function ThemeStyles({ theme }: { theme: 'dark' | 'light' }) {
  useRawCSS(() => `
    body {
      margin: 0;
      background: ${theme === 'dark' ? '#000' : '#fff'};
      color: ${theme === 'dark' ? '#fff' : '#000'};
    }
  `, [theme], { id: 'theme-body' });

  return null;
}
```

### `createInjector(config?): StyleInjector`

Creates an isolated injector instance with custom configuration.

```typescript
import { createInjector } from '@tenphi/tasty';

// Create isolated instance for testing
const testInjector = createInjector({
  devMode: true,
  forceTextInjection: true,
});

const result = testInjector.inject(rules);
```

### `keyframes(steps, nameOrOptions?): KeyframesResult`

Injects CSS keyframes with automatic deduplication.

```typescript
// Generated name (k0, k1, k2...)
const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

// Custom name
const slideIn = keyframes({
  '0%': { transform: 'translateX(-100%)' },
  '100%': { transform: 'translateX(0)' },
}, 'slideInAnimation');

// Use in tasty styles (recommended)
const AnimatedBox = tasty({
  styles: {
    animation: `${fadeIn} 300ms ease-in`,
  },
});

// Or use with injectGlobal for fixed selectors
injectGlobal([{
  selector: '.my-animated-class',
  declarations: `animation: ${slideIn} 500ms ease-out;`
}]);

// Cleanup keyframes (if needed)
fadeIn.dispose();    // Immediate keyframes deletion from DOM
slideIn.dispose();   // Immediate keyframes deletion from DOM
```

### `configure(config): void`

Configures the Tasty style system. `configure()` is optional, but if you use it, it must be called **before** any styles are generated (before first render).

```typescript
import { configure } from '@tenphi/tasty';

configure({
  devMode: true,                     // Enable development features (auto-detected)
  maxRulesPerSheet: 8192,            // Cap rules per stylesheet (default: 8192)
  forceTextInjection: false,         // Force textContent insertion (auto-detected for tests)
  nonce: 'csp-nonce',                // CSP nonce for security
  gc: {                              // Garbage collection for unused styles
    touchInterval: 1000,             // Touch events between GC cycles (default: 1000)
    capacity: 1000,                  // Max unused styles to retain (default: 1000)
  },
  states: {                          // Global predefined states for advanced state mapping
    '@mobile': '@media(w < 768px)',
    '@dark': '@root(schema=dark)',
  },
});
```

**Auto-Detection Features:**
- `devMode`: Automatically enabled in development environments (detected via `isDevEnv()`)
- `forceTextInjection`: Automatically enabled in test environments (Jest, Vitest, Mocha, happy-dom, jsdom)

**Injection Modes:**

Each sheet picks its write mode once, when it is created, and keeps it for its
lifetime:

| Mode | How rules are written | How rules are removed |
|---|---|---|
| CSSOM (default) | `styleSheet.insertRule(rule, index)` | `styleSheet.deleteRule(index)` |
| Text (`forceTextInjection`, or when `styleElement.sheet` is unavailable) | appended to `<style>.textContent` | rule texts are tracked per sheet and the element's text is rebuilt without them |
| Adopted (ShadowRoot with constructable sheets) | `insertRule` on the constructable sheet | `deleteRule` on the constructable sheet |

Text mode cannot edit a single rule in place the way CSSOM can, so the sheet
keeps the inserted rule texts in index order and rewrites the element on delete.
Dispose, ref-counted cleanup and GC therefore behave identically in every mode.

**Configuration Notes:**
- Most options have sensible defaults and auto-detection
- `configure()` is optional - the injector works with defaults
- **Configuration is locked after styles are generated** - calling `configure()` after first render will emit a warning and be ignored
- `gc.touchInterval`: Number of touch events between GC cycles. Each style render counts as a touch. When the counter reaches this value, GC is scheduled via `requestIdleCallback`.
- `gc.capacity`: Maximum number of unused styles (not in the DOM, not pinned) to retain. When exceeded, the least recently used are evicted first. Rendered and pinned styles don't count against this limit.

---

### At-rule injection

Beyond ordinary rules, the injector has a dedicated entry point per at-rule. All of them deduplicate by name and are **permanent** — there is no ref-counting or dispose, because a rule that other CSS references by name cannot be safely removed while any of it might still apply.

| Function | Injects | Notes |
|---|---|---|
| `keyframes(steps, nameOrOptions?)` | `@keyframes` | The exception: ref-counted and disposed immediately when unused. Returns the injected name, which may differ from the requested one. |
| `property(name, options?)` | `@property` | `name` accepts `$name`, `#name`, or `--name`. Usually unnecessary — types are inferred automatically unless `configure({ autoPropertyTypes: false })`. |
| `fontFace(family, descriptors, options?)` | `@font-face` | Deduplicated by family **and** descriptor content, so several faces of one family coexist. |
| `counterStyle(name, descriptors, options?)` | `@counter-style` | |
| `func(name, definition, options?)` | `@function` | `name` accepts `$$name`, `$name`, or `--name`. Abbreviated because `function` is a reserved word. |

Every one of these takes an optional `root` (a `Document` or `ShadowRoot`).

`func()` also accepts `weak: true`, which registers the rule **without** overriding an existing one of the same name. `configure()` uses it for global `@function` definitions so a component-local definition always wins over the global default, regardless of which is injected first.

```ts
import { counterStyle, fontFace, func, property } from '@tenphi/tasty';

property('$card-elevation', { syntax: '<number>', initialValue: '0' });
fontFace('Inter', { src: 'url(/inter.woff2)', fontWeight: '400 700' });
counterStyle('dashes', { system: 'cyclic', symbols: '"—"', suffix: ' ' });
func('$$negative', { args: ['$value'], result: '(-1 * $value)' });
```

---

## Advanced Features

### Style Result Format

The injector works with `StyleResult` objects from the tasty parser:

```typescript
interface StyleResult {
  selector: string;              // CSS selector
  declarations: string;          // CSS declarations
  atRules?: string[];           // @media, @supports, etc.
  nestingLevel?: number;        // Nesting depth for specificity
}

// Example StyleResult
const styleRule: StyleResult = {
  selector: '.t-button',
  declarations: 'padding: 8px 16px; background: blue; color: white;',
  atRules: ['@media (min-width: 768px)'],
  nestingLevel: 0,
};
```

### Batched Injection

`configure({ batchInjection: true })` queues every sheet write — component
rules, global rules, raw CSS and at-rules — into one FIFO and applies them
together, so the document is style-invalidated once per flush instead of once per
component. `<TastyBatchProvider>` flushes in `useInsertionEffect`, before any
layout effect, so a queued write can never be observed by a measurement. See
[Batched injection](configuration.md#batched-injection) for the modes and the
ordering guarantee. `flushStyles()` applies pending writes on demand; every read
API here calls it for you.

### Deduplication & Performance

```typescript
// Identical CSS rules get the same className
const button1 = inject([{
  selector: '.t-btn1',
  declarations: 'padding: 8px; color: red;'
}]);

const button2 = inject([{
  selector: '.t-btn2', 
  declarations: 'padding: 8px; color: red;' // Same declarations
}]);

// Both get the same className due to deduplication
console.log(button1.className === button2.className); // true
```

### Pinning

```typescript
// Multiple callers using the same styles
const comp1 = inject([commonStyle]);
const comp2 = inject([commonStyle]);
const comp3 = inject([commonStyle]);

// Style is pinned while any caller holds a handle
comp1.dispose(); // pins: 3 → 2
comp2.dispose(); // pins: 2 → 1
comp3.dispose(); // pins: 1 → 0, now up to the DOM and gc()

// Unpinned does not mean deleted: the rule stays cached and is reused instantly
// by the next inject(). gc() decides when it actually goes.
```

Pinning covers callers that hold a handle. Styles that come from rendering are
never pinned — see `{ pin: false }` under
[`inject()`](#injectrules-options-injectresult) — so what keeps them alive is
being in the DOM, and nothing else.

### Garbage Collection

```typescript
import { configure, gc } from '@tenphi/tasty';

// Keyframes: Disposed immediately when refCount = 0 (safer for global scope)
// CSS rules: Tracked by touch count and cleaned up via gc()
//
// A CSS rule is collectible when no element carries its class AND nobody
// pinned it with inject().

configure({
  gc: {
    touchInterval: 1000,   // Schedule GC every 1000 touches
    capacity: 1000,        // Max unused styles to retain
  },
});

// Manual GC (synchronous, returns number of swept styles):
gc();

// Force-remove ALL unused styles (e.g. on route change or test teardown):
gc({ force: true });

// cleanup() is the same thing:
cleanup();

// GC is also triggered automatically by touch count during rendering.
// Every `touchInterval` touches, GC is scheduled via requestIdleCallback
// (with a timeout, so a page that never goes idle is still swept).
//
// That scheduled sweep only collects a class it has previously seen on an
// element. Rendering is not commit-aware: a concurrent render can yield between
// the inject() that creates a class and the commit that attaches it, for any
// number of turns, so "no element carries this class" is evidence that the
// class is finished only once the DOM is known to have held it. Injection and
// every render clear that sighting again.
//
// The trade-off: a class that mounts and unmounts between two sweeps is never
// seen, so it is not collected automatically. It stays cached and reusable, and
// an explicit gc() or cleanup() takes it — those collect everything unused
// straight away.

// Benefits:
// - Activity-proportional: busy apps trigger GC more often
// - DOM-safe: styles currently in the DOM are never evicted
// - Oldest-first: least recently used styles are evicted first
// - Keyframes: Immediate cleanup prevents global namespace pollution
// - Unused styles stay cached until evicted, so re-rendering them is a cache hit
```

### Shadow DOM Support

```typescript
// Works with Shadow DOM
const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });

const shadowStyles = inject([{
  selector: '.shadow-component',
  declarations: 'color: purple;'
}], { root: shadowRoot });

// Keyframes in Shadow DOM
const shadowAnimation = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 }
}, { root: shadowRoot, name: 'shadowFade' });
```

---

## SSR & Testing

### Server-Side Rendering

```typescript
import { getCSSText, getCSSTextForNode } from '@tenphi/tasty';

// Extract all CSS for SSR
const cssText = getCSSText();

// Extract CSS for specific DOM subtree (like jest-styled-components)
const container = render(<MyComponent />);
const componentCSS = getCSSTextForNode(container);
```

### Test Environment Detection

```typescript
// Automatically detected test environments:
// - NODE_ENV === 'test'
// - Jest globals (jest, describe, it, expect)
// - jsdom / HappyDOM user agent
// - Vitest globals (vitest)
// - Mocha globals (mocha)

import { configure, isTestEnvironment, resetConfig } from '@tenphi/tasty';

const isTest = isTestEnvironment();

// Reset config between tests to allow reconfiguration
beforeEach(() => {
  resetConfig();
  configure({
    forceTextInjection: isTest,  // More reliable in test environments
    devMode: true,               // Always enable dev features in tests
  });
});
```

### Memory Management in Tests

```typescript
// Clean up between tests
afterEach(() => {
  cleanup(); // Force cleanup of unused styles
});

// Full cleanup after test suite
afterAll(() => {
  destroy(); // Destroy all stylesheets and reset state
});
```

---

## Development Features

### Performance Metrics

When `devMode` is enabled, the injector tracks comprehensive metrics:

```typescript
import { configure, injector } from '@tenphi/tasty';

configure({ devMode: true });

// Access metrics through the global injector
const metrics = injector.instance.getMetrics();

console.log({
  cacheHits: metrics.hits,           // Successful cache hits  
  cacheMisses: metrics.misses,       // New styles injected
  unusedHits: metrics.unusedHits,    // Styles currently eligible for eviction (scans the DOM)
  bulkCleanups: metrics.bulkCleanups, // Number of bulk cleanup operations
  stylesCleanedUp: metrics.stylesCleanedUp, // Total styles removed in bulk cleanups
  totalInsertions: metrics.totalInsertions, // Lifetime insertions
  totalUnused: metrics.totalUnused,  // Times a pinned style lost its last pin
  startTime: metrics.startTime,      // Metrics collection start timestamp
  cleanupHistory: metrics.cleanupHistory, // Detailed cleanup operation history
});
```

### Debug Information

```typescript
// Get detailed information about injected styles
const debugInfo = injector.instance.getDebugInfo();

console.log({
  activeStyles: debugInfo.activeStyles,     // Currently active styles
  unusedStyles: debugInfo.unusedStyles,     // Styles marked for cleanup
  totalSheets: debugInfo.totalSheets,       // Number of stylesheets
  totalRules: debugInfo.totalRules,         // Total CSS rules
});
```

### Cleanup History

```typescript
// Track cleanup operations over time
const metrics = injector.instance.getMetrics();

metrics.cleanupHistory.forEach(cleanup => {
  console.log({
    timestamp: new Date(cleanup.timestamp),
    classesDeleted: cleanup.classesDeleted,
    rulesDeleted: cleanup.rulesDeleted,
    cssSize: cleanup.cssSize,              // Total CSS size removed (bytes)
  });
});
```

---

## Performance Optimizations

### Best Practices

```typescript
// ✅ Reuse styles - identical CSS gets deduplicated
const buttonBase = 'padding: 8px 16px; border-radius: 4px;';

// ✅ Avoid frequent disposal and re-injection
// Let the injector handle cleanup

// ✅ Use bulk operations for global styles
injectGlobal([
  { selector: 'body', declarations: 'margin: 0;' },
  { selector: '*', declarations: 'box-sizing: border-box;' },
  { selector: '.container', declarations: 'max-width: 1200px;' }
]);

// ✅ Configure GC for your app (BEFORE first render!)
import { configure } from '@tenphi/tasty';

configure({
  gc: {
    touchInterval: 1000,   // Schedule GC every 1000 style touches
    capacity: 1000,        // Max unused styles to retain
  },
});
```

### Memory Management

```typescript
// The injector automatically manages memory through:

// 1. Hash-based deduplication - same CSS = same className
// 2. DOM-driven lifetime - a rendered class is never evicted
// 3. Pinning - inject() callers hold their classes until they dispose
// 4. Immediate keyframes cleanup - disposed instantly when refCount = 0
// 5. Touch-count GC - unused CSS rules are evicted oldest-first when over capacity

// Manual cleanup is rarely needed but available:
cleanup(); // Remove every rule that is neither rendered nor pinned
destroy(); // Nuclear option: remove all stylesheets and reset
```

---

## Integration with Tasty

The Style Injector is seamlessly integrated with the higher-level Tasty API:

```jsx
// High-level tasty() API
const StyledButton = tasty({
  styles: {
    padding: '2x 4x',
    fill: '#purple',
    color: '#white',
  }
});

// Internally uses the injector:
// 1. Styles are parsed into StyleResult objects
// 2. inject() is called with the parsed results, unpinned
// 3. Component gets the returned className
// 4. gc() reclaims the class once no element carries it
```

For most development, you'll use the [React API](./react-api.md) rather than the injector directly. The injector provides the high-performance foundation that makes Tasty's declarative styling possible.

---

## When to Use Direct Injection

Direct injector usage is recommended for:

- **Custom CSS-in-JS libraries** built on top of Tasty
- **Global styles** that don't fit the component model
- **Third-party integration** where you need low-level CSS control
- **Performance-critical scenarios** where you need direct control
- **Testing utilities** that need to inject or extract CSS

For regular component styling, prefer the [`tasty()` API](./react-api.md) which provides a more developer-friendly interface.
