# Configuration

Configure the Tasty style system before your app renders using the `configure()` function. Configuration must be done **before any styles are generated** (before first render). For a higher-level docs map, see the [Docs Hub](README.md).

```jsx
import { configure } from '@tenphi/tasty';

configure({
  // CSP nonce for style elements
  nonce: 'abc123',

  // Global state aliases
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(768px <= w < 1024px)',
    '@dark': '@root(schema=dark)',
  },

  // Parser configuration
  parserCacheSize: 2000, // LRU cache size (default: 1000)

  // Custom units (merged with built-in units)
  units: {
    vh: 'vh',
    vw: 'vw',
    custom: (n) => `${n * 10}px`, // Function-based unit
  },

  // Custom functions — a single map for both flavors, discriminated by value type:
  functions: {
    // Bare key + function value → parse-time function, called as `double(...)`
    double: (groups) => {
      const value = parseFloat(groups[0]?.output || '0');
      return `${value * 2}px`;
    },
    // `$$name` key + object value → declarative CSS @function, called as `$$negative(...)`
    $$negative: { args: ['$value'], result: '(-1 * $value)' },
  },
});
```

These docs use `data-schema="dark"` in examples. If your app already standardizes on a different attribute such as `data-theme`, keep the same pattern and swap the attribute name consistently everywhere you define root-state aliases.

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nonce` | `string` | - | CSP nonce for style elements |
| `maxRulesPerSheet` | `number` | `8192` | Maximum rules per injected stylesheet |
| `forceTextInjection` | `boolean` | auto (`true` in test envs) | Force text-node CSS injection instead of constructable stylesheets |
| `devMode` | `boolean` | auto | Enable development-mode features: performance metrics and debug info |
| `states` | `Record<string, string>` | - | Global state aliases for advanced state mapping |
| `parserCacheSize` | `number` | `1000` | Parser LRU cache size |
| `units` | `Record<string, string \| UnitHandler>` | Built-in | Custom units (merged with built-in). See [built-in units](dsl.md#built-in-units) |
| `functions` | `Record<string, FunctionDefinition \| Function>` | - | Custom functions (merged). Bare keys → parse functions; `$$name` keys → declarative CSS `@function` definitions |
| `handlers` | `Record<string, StyleHandlerDefinition>` | Built-in | Custom style handlers (replace built-in). See [Custom Style Handlers](#custom-style-handlers) |
| `propHandlers` | `Record<string, PropHandlerDefinition>` | - | Props middleware for every component — props in, props out. See [Props Middleware](#props-middleware) |
| `baseStyleProps` | `readonly string[]` | - | Style names exposed as props on **every** component. See [Base Style Props](#base-style-props) |
| `tokens` | `Record<string, value \| stateMap>` | - | Design tokens injected as `:root` CSS custom properties |
| `replaceTokens` | `Record<string, string \| number \| boolean>` | - | Parse-time token substitution (inline replacement). `boolean` is allowed for `#` color tokens |
| `keyframes` | `Record<string, KeyframesSteps>` | - | Global keyframes for animations |
| `properties` | `Record<string, PropertyDefinition>` | - | Global CSS @property definitions |
| `fontFaces` | `Record<string, FontFaceInput>` | - | Global @font-face definitions |
| `counterStyles` | `Record<string, CounterStyleDescriptors>` | - | Global @counter-style definitions |
| `polyfills` | `{ functions?: boolean }` | `{}` | Opt-in polyfills for not-yet-baseline features. `functions: true` inlines `@function` calls into plain CSS at parse time |
| `autoPropertyTypes` | `boolean` | `true` | Auto-infer and register `@property` types from values |
| `recipes` | `Record<string, RecipeStyles>` | - | Predefined style recipes (named style bundles) |
| `presets` | `Record<string, TypographyPreset>` | - | Typography presets — shorthand for `generateTypographyTokens()` |
| `globalStyles` | `Record<string, Styles>` | - | Global Tasty styles keyed by CSS selector |
| `plugins` | `TastyPlugin[]` | - | Plugins that bundle any of the above (processed in order; later override earlier, and direct config wins over all). See [Plugins](plugins.md) |
| `gc` | `GCConfig` | - | Garbage-collection tuning for unused styles (`{ touchInterval, capacity }`) |
| `batchInjection` | `boolean \| 'always'` | `false` | Defer stylesheet writes and apply them in one batch. See [Batched injection](#batched-injection) |
| `colorSpace` | `'rgb' \| 'hsl' \| 'oklch'` | - | **Deprecated** — no longer has any effect. See [Color space](#color-space) |
| `namePrefix` | `string` | `'t'` (runtime) / `'ts'` (zero-runtime) | Prefix prepended to every generated identifier (class, keyframe, counter-style names). Must match `^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$`. See [Name prefix](#name-prefix). |

---

## Batched Injection

Every `insertRule()` on a live stylesheet invalidates style for that sheet's
scope. Components inject during React's render phase, and if anything else reads
layout in the same pass, the two interleave:

```
inject -> read (forced style recalc) -> inject -> read (forced recalc) -> ...
```

A UI kit that measures during render — popovers, autosizing inputs, virtualized
lists — can turn one mount into a dozen full-tree recalculations. `batchInjection`
queues the writes instead and applies them together, so the tree is invalidated
once per flush.

```tsx
import { configure, TastyBatchProvider } from '@tenphi/tasty';

configure({ batchInjection: true });

createRoot(el).render(
  <TastyBatchProvider>
    <App />
  </TastyBatchProvider>,
);
```

### Why the provider is required

Deferring a write past React's layout phase would let a `useLayoutEffect`
measure an element whose rules are not in the sheet yet and read its *unstyled*
box — a wrong number, not a stale one, so it never self-corrects.

`TastyBatchProvider` closes that hole. It opens a *batch window* during its
render and closes it — flushing — in `useInsertionEffect`, which React runs in
the mutation phase, before any layout effect:

```
provider renders          -> window OPEN
  children render         -> injections queued
provider insertionEffect  -> FLUSH, window CLOSED
layout effects run        -> rules are in the sheet
```

With `batchInjection: true` a write is only ever queued inside such a window, so
turning the flag on can make injection cheaper but can never make a measurement
wrong. Injections outside a window are written straight through, exactly as with
batching off:

- a deep update that did not re-render the provider
- an injection from a layout effect, an event handler or an async callback
- SSR and RSC, where there is no live sheet at all

Mount the provider as high in the tree as you can: batching applies to the
commits it takes part in.

### Modes

| Value | Behaviour |
|-------|-----------|
| `false` (default) | One `insertRule()` per component, synchronously. |
| `true` | Batch inside a provider window only. Cannot affect measurement. Without the provider nothing is batched, and dev mode says so once. |
| `'always'` | Batch every injection, flushing on a microtask when no window is open. Covers more commits; a `useLayoutEffect` measuring a freshly mounted element can read its unstyled box. Paint is unaffected — microtasks always drain before the browser paints. |

### Ordering

All writes share one FIFO queue — component rules, global rules, raw CSS,
`@property`, `@keyframes`, `@font-face`, `@counter-style` and `@function`.
Draining it in insertion order keeps the sheet byte-identical to unbatched
output, which matters because equal-specificity rules resolve by document order.

### SSR, RSC and zero-runtime

**Server render — nothing to batch, safe to leave enabled.** SSR and RSC collect
CSS as text through `ServerStyleCollector`; the runtime injector never runs
there, so `batchInjection` changes nothing either way. `<TastyBatchProvider>`
renders its children and does nothing else: the window it opens is a no-op
without a `document`, and the `useInsertionEffect` that would close it never
fires on the server. Configure the flag once in shared code — no environment
branching needed.

**Hydration — the better your SSR coverage, the less there is to batch.**
`hydrateTastyClasses()` (wired up for you by `@tenphi/tasty/ssr/next` and the
Astro integration) pre-populates the injector from `window.__TASTY__`, so
hydrating a server-rendered class is a cache hit that produces no sheet write at
all. Batching pays off on what SSR could not cover: client-only routes, styles
that first appear after hydration (a `styles` prop that changes on interaction, a
modal or popover mounting), and dynamic tokens.

**Astro islands — one provider per island, or `'always'`.** Every island is its
own React root, so a provider inside one island does not open a window for
another. With `batchInjection: true`, wrap each island root that renders enough
tasty components to be worth it. `'always'` needs no provider and covers every
island, at the cost of the measurement hazard above. Either way, an island that
only re-hydrates server-rendered classes has nothing to batch.

**Zero-runtime (`tastyStatic`) — unaffected.** Build-time extraction never
touches the injector: the babel plugin emits either a CSS file import or an
`injectCSS()` call from `@tenphi/tasty/static/inject`, which appends text to a
single `<style data-tasty-static>` element. `batchInjection` only defers CSSOM
writes made by the runtime injector, so extracted styles are unchanged. In an app
that mixes both, it still applies to the runtime half.

### `flushStyles()`

Applies every pending write immediately. Every injector read API calls it for
you — `getCSSText`, `getCSSTextForClasses`, `getCSSTextForNode`,
`getRawCSSText`, `isPropertyDefined`, `getMetrics`, `cleanup`, `gc` and
`destroy` — so a read never observes a partial sheet.
Call it directly before measuring in code that runs outside a batch window under
`'always'`:

```tsx
import { flushStyles } from '@tenphi/tasty';

useLayoutEffect(() => {
  flushStyles();
  const { width } = ref.current.getBoundingClientRect();
}, []);
```

`hasPendingStyleWrites()` reports whether anything is queued, and
`resetStyleBatch()` drops the queue without applying it (tests only).

---

## Color Space

> **Deprecated.** `configure({ colorSpace })` no longer has any effect and will
> be removed in the next major. Setting it warns in development.

A `#name` token's value used to be rewritten into a configured color space, so
`#brand: '#ff8800'` declared `--brand-color: oklch(0.75 0.16 55)`. That existed
to serve the opacity suffix, which needed numeric channels to write an alpha
into. Opacity now uses CSS relative color syntax —
`oklch(from var(--brand-color) l c h / .5)` — which has the browser read the
channels, so there is nothing left for the setting to decide.

A color is emitted exactly as authored:

```jsx
configure({ tokens: { '#brand': '#ff8800' } });
// → --brand-color: #ff8800
```

That holds for every form: a hex literal, a native color function, a bare CSS
color name, a `color-mix()`, a `light-dark()`, a fallback chain. A `#token`
reference still resolves to its `var()` chain, and a plugin color function such
as `okhsl()` is still resolved by the parser to the color it denotes.

To address a token's channels, use relative color syntax against the token:

```css
background: oklch(from var(--brand-color) calc(l * 1.2) c h);
```

This works on any `<color>`, including the ones no build-time conversion could
have evaluated — and it is what the [opacity suffix](dsl.md#color-tokens--opacity)
itself uses. Its space is always `oklch`, which is unbounded, so a wide-gamut
color survives a round trip a narrower space would clamp.

### Migrating off `colorSpace`

Drop the option. If you relied on the uniform output format, nothing in Tasty
needs it — author your tokens in the space you want them emitted in, since the
value now passes through untouched:

```jsx
// before: any input, normalized to the configured space on the way out
configure({ colorSpace: 'oklch', tokens: { '#brand': '#ff8800' } });

// after: author it in the space you want
configure({ tokens: { '#brand': 'oklch(0.75 0.16 55)' } });
```

### Migrating off the channel companions

A `#name` token used to declare a second variable beside `--name-color` holding
its channels decomposed, suffixed with the configured space —
`--brand-color-oklch: 0.75 0.16 55` — and a `color` style emitted
`--current-color-{space}` beside `--current-color`. Both are gone, for the same
reason: they existed so an opacity suffix had channels to write an alpha into.

These were never part of the public API, but they were visible in the emitted
CSS, so hand-authored CSS may reference one. Address the token itself instead:

```css
/* before */
color: oklch(var(--brand-color-oklch) / 0.5);
background: oklch(var(--brand-color-oklch));

/* after */
color: oklch(from var(--brand-color) l c h / 0.5);
background: var(--brand-color);
```

The replacement is strictly more capable — the companion could only be
decomposed for a color the engine could evaluate at build time, while relative
color syntax works on every `<color>`, including a `color-mix()`, a
`light-dark()`, and a variable Tasty never defined.

---

## Name Prefix

Every identifier Tasty generates — class names, keyframe names, counter-style names — starts with a configurable prefix. The runtime, SSR, and RSC paths default to `'t'`; the zero-runtime build path (`tastyStatic` via the Babel plugin) defaults to `'ts'` so static-extracted classes can never collide with runtime classes when both are loaded on the same page.

```jsx
configure({
  namePrefix: 'mb',
});
```

The prefix is prepended verbatim to the hash, so include any separator inside the prefix string itself:

| Setting | Class | Keyframe | Counter-style |
|---|---|---|---|
| `'t'` (runtime default) | `t1a2b3` | `tk1a2b3` | `tc1a2b3` |
| `'ts'` (zero-runtime default) | `ts1a2b3` | `tsk1a2b3` | `tsc1a2b3` |
| `'mb'` | `mb1a2b3` | `mbk1a2b3` | `mbc1a2b3` |
| `'myapp-'` | `myapp-1a2b3` | `myapp-k1a2b3` | `myapp-c1a2b3` |

The single-letter discriminators (`k` for keyframes, `c` for counter-styles) keep the three kinds visually distinct in devtools — they are not required for correctness because CSS keeps these in separate namespaces.

### Rules

- Must match `^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$`. Examples that pass: `'t'`, `'ts'`, `'app'`, `'myapp-'`, `'_foo'`. Examples that fail: `''`, `'1foo'`, `'my app'`.
- Validated at `configure()` time; an invalid prefix throws synchronously rather than silently producing broken hydration.
- Locked once styles have been generated, like all other config.

### Coexistence with the zero-runtime build

The runtime and zero-runtime builds **must use different prefixes** when both are loaded on the same page. Defaults already guarantee this; if you customize one, customize the other accordingly:

```jsx
// app config (runtime / SSR / RSC)
configure({ namePrefix: 'mb' });

// tasty-zero.config.ts (Babel plugin)
export default { namePrefix: 'mbs' };
```

If you only use one of the two builds, you only need to set `namePrefix` on that path.

---

## Design Tokens

Design tokens define CSS custom properties on `:root`. They are injected automatically when the first style is rendered. Values are parsed through the Tasty DSL, so you can use units, color syntax, and other DSL features.

Tokens support state maps for responsive or theme-aware values:

```jsx
configure({
  tokens: {
    '$gap': '4px',
    '$radius': '6px',
    '#primary': {
      '': '#purple',
      '@dark': '#light-purple',
    },
    '$font-size': {
      '': '14px',
      '@mobile': '12px',
    },
  },
});
```

- `$name` keys become `--name` CSS custom properties
- `#name` keys become `--name-color` custom properties
- Names keep their case, since CSS custom properties are case-sensitive: `$myVar` is `--myVar` and is referenced as `$myVar`. A leading capital is not supported and folds — `$Foo` and `#Purple` become `--foo` and `--purple-color` — so start names lowercase. Kebab-case (`$my-var`) remains the convention.

Tokens are automatically emitted in all rendering modes: runtime (client), SSR, and zero-runtime (Babel plugin).

---

## Replace Tokens (Parse-Time Substitution)

Replace tokens are **substituted inline at parse time** — they are baked into the generated CSS, not resolved via CSS custom properties at runtime. This makes them ideal for value aliases and shorthand references.

Use `$name` for value tokens and `#name` for color token aliases:

```jsx
configure({
  replaceTokens: {
    $spacing: '2x',
    '$card-padding': '4x',
    '#accent': '#purple',
    '#surface-hover': '#gray.05',
  },
});
```

When a component uses `padding: '$card-padding'`, the parser replaces it with `'4x'` before generating CSS. When a component uses `fill: '#accent'`, it is replaced with `'#purple'`, which in turn resolves to `var(--purple-color)`.

See [Replace Tokens](dsl.md#replace-tokens) in the Style DSL reference.

---

## Font Face

Register custom fonts globally so every component can reference them by family name. Values are descriptor objects or arrays (for multiple weights/styles). Rules are injected eagerly when styles are first generated.

```ts
configure({
  fontFaces: {
    'Brand Sans': [
      {
        src: 'url("/fonts/brand-regular.woff2") format("woff2")',
        fontWeight: 400,
        fontDisplay: 'swap',
      },
      {
        src: 'url("/fonts/brand-bold.woff2") format("woff2")',
        fontWeight: 700,
        fontDisplay: 'swap',
      },
    ],
    Icons: {
      src: 'url("/fonts/icons.woff2") format("woff2")',
      fontDisplay: 'block',
    },
  },
});
```

Now any component can use `font: '"Brand Sans", sans-serif'` and the browser will already have the `@font-face` rules in the stylesheet.

See [Font Face (`@font-face`)](dsl.md#font-face-font-face) for inline usage inside component styles and the full list of supported descriptors.

---

## Counter Style

Define custom list-marker algorithms globally. Rules are injected eagerly when styles are first generated.

```ts
configure({
  counterStyles: {
    thumbs: {
      system: 'cyclic',
      symbols: '"👍"',
      suffix: '" "',
    },
    'lower-roman-parens': {
      system: 'extends lower-roman',
      suffix: '") "',
    },
  },
});
```

Components can then reference `listStyleType: 'thumbs'` directly.

See [Counter Style (`@counter-style`)](dsl.md#counter-style-counter-style) for inline usage inside component styles and the full list of supported descriptors.

---

## Functions

The single `functions` map holds both kinds of custom functions, discriminated by the value type:

- **Parse functions** — a **bare key** with a **function value** `(groups) => string`. Runs at parse time and is called as `name(...)`. Use these for computed/derived CSS that JavaScript produces (e.g. color-space conversions).
- **CSS `@function` definitions** — a **`$$name` key** with an **object value** (a [`FunctionDefinition`](https://developer.mozilla.org/en-US/docs/Web/CSS/@function)). Injected eagerly as a native `@function` rule and called as `$$name(...)` (→ `--name(...)`).

```ts
configure({
  functions: {
    // Parse function — bare key, function value
    double: (groups) => `calc(2 * ${groups[0]?.output ?? '0'})`,

    // CSS @function — `$$` key, object value
    $$negative: { args: ['$value'], result: '(-1 * $value)' },
    $$shadow: {
      args: { '$shadow-color': { syntax: '<color>', default: 'inherit' } },
      returns: '<color>',
      $offset: '2px',
      result: '$offset $offset ($shadow-color, black)',
    },
  },
});
```

Components then invoke parse functions as `double(...)` and CSS functions with the `$$name(...)` sugar, e.g. `margin: '$$negative(10px) top'`.

> A key whose prefix doesn't match its value type (an object under a bare key, or a function under a `$$` key) is **ignored with a dev-mode warning**.

See [Functions (`@function`)](dsl.md#functions-function) for inline usage inside component styles, the full descriptor shape, and token conventions. `@function` is an experimental CSS feature — unsupported browsers safely ignore the native rule (see the polyfill below).

### Custom color functions

A parse function whose output is an already-supported color (`rgb`, `hsl`, `#…`, `oklch`, …) is treated as a **color function**: it works everywhere a color is accepted — style values, `#token.alpha` opacity injection, and `parseColor` — with no extra registration. This is the same mechanism the built-in `okhsl`/`okhst` plugins use; they are ordinary plugins registered by default.

```ts
import { configure, createColorFunc } from '@tenphi/tasty';

// A custom color space is just a `functions` entry.
const myColorPlugin = () => ({
  name: 'mycolor',
  functions: {
    // Hand-written parse function:
    mycolor: (groups) => {
      const [r, g, b] = groups[0].all;
      return `rgb(${r} ${g} ${b})`;
    },
  },
});

configure({ plugins: [myColorPlugin()] });

// Now `mycolor(...)` is a color in every context:
//   fill: 'mycolor(255 0 0)'
//   fill: '#brand.5'   (with replaceTokens: { '#brand': 'mycolor(255 0 0)' })
```

For HSL-style color spaces (a hue angle plus two percentages), the exported `createColorFunc(name, convert, label?)` helper handles angle/percentage parsing, clamping, alpha, and caching. `convert` returns sRGB `[r, g, b]` in 0-1; `label` is an optional string used only in dev warnings (e.g. `'H S L'`) and has no effect on output. This is exactly how `okhslPlugin`/`okhstPlugin` are implemented.

---

## Polyfills

`@function` only ships natively in Chromium 139+. To use CSS functions in browsers that don't support the at-rule yet (Firefox, Safari), enable the **functions polyfill**, which expands every `$$name(...)` call into plain CSS (`calc()`/`var()`/`color-mix()`) at parse time instead of emitting the native `@function` rule:

```ts
configure({
  polyfills: {
    functions: true, // default: false
  },
  functions: {
    $$negative: { args: ['$value'], result: '(-1 * $value)' },
  },
});

// Now `margin: '$$negative(10px) top'` renders `margin: calc(-1 * 10px) 0 0 0`
// — no native @function rule is emitted.
```

This works across all rendering modes (client, SSR/RSC, and `tastyStatic`) because expansion happens in the parser. Note `polyfills.functions` (the feature toggle) is distinct from the top-level `functions` (the definitions map).

**Decided limitations when the polyfill is on:**

- **No native fallback** — functions are always inlined; we do exactly what is configured.
- **Conditional results** (`@media`/`@supports`/`if()` inside `result`) are inlined verbatim; the conditional nuance is not resolved per-element.
- **Typed params / `returns`** are dropped (inlining is purely lexical substitution).
- **Param name collisions** are avoided by fully inlining argument values (no function-internal custom properties are emitted) and by namespacing the function's own variables.
- **Recursion** — self/mutually-recursive functions are not expanded; the cycle guard bails and leaves the call untouched.

---

## Recipes

Recipes are predefined, named style bundles. Define them globally via `configure()`:

```jsx
configure({
  recipes: {
    card: {
      padding: '4x',
      fill: '#surface',
      radius: '1r',
      border: true,
    },
    elevated: {
      shadow: '2x 2x 4x #shadow',
    },
  },
});
```

Recipe values are flat tasty styles (no sub-element keys). They may contain base styles, tokens, local states, `@keyframes`, and `@property`. Recipes cannot reference other recipes.

For how to apply, compose, and override recipes in components, see [Recipes](dsl.md#recipes) in the Style DSL reference.

---

## Typography Presets

Typography presets are a shorthand for `generateTypographyTokens()`. Instead of calling the function manually and spreading the result into `tokens`, pass the presets directly:

```jsx
configure({
  presets: {
    h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
    t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
    tag: {
      fontSize: '10px',
      lineHeight: '1.4',
      letterSpacing: '0.04em',
      fontWeight: '600',
    },
  },
});
```

Each preset generates `$name-font-size`, `$name-line-height`, `$name-letter-spacing`, `$name-font-weight`, and optional `$name-bold-font-weight`, `$name-icon-size`, `$name-text-transform`, `$name-font-family`, `$name-font-style` tokens.

Preset values support state maps for responsive or theme-aware typography:

```jsx
configure({
  presets: {
    t2: {
      fontSize: '16px',
      lineHeight: '1.5',
      fontWeight: { '': '400', '@dark': '300' },
    },
  },
});
```

The generated tokens are merged **under** explicit `tokens` — if both `presets` and `tokens` define `$t2-font-weight`, the `tokens` value wins. Plugins can also provide `presets`; plugin presets are merged first, then config presets, then explicit tokens on top.

---

## Global Styles

Apply Tasty styles to any selector via configuration, without needing `useGlobalStyles(selector, ...)` at runtime:

```jsx
configure({
  globalStyles: {
    body: {
      fill: '#surface',
      color: '#text',
      preset: 't2',
      margin: 0,
      font: 'system-ui, sans-serif',
    },
    html: {
      overflow: 'hidden',
    },
  },
});
```

Each key is a CSS selector, and each value is a Tasty `Styles` object supporting the full style syntax including style properties, tokens, state maps, and selector-based sub-styling (e.g. `$: '> .app'` for elements outside React scope). Global styles are injected alongside `:root` tokens when the first style is rendered.

Global styles are automatically emitted in all rendering modes: runtime (client), SSR, and zero-runtime (Babel plugin). Plugins can also provide `globalStyles`; they are merged per selector with config global styles (config wins on conflict).

---

## Auto Property Types

CSS cannot transition or animate custom properties unless their type is declared via [`@property`](https://developer.mozilla.org/en-US/docs/Web/CSS/@property). Tasty handles this automatically — when a custom property is assigned a concrete value (e.g. `'$scale': 1`, `'$gap': '10px'`, `'#accent': 'purple'`), the type is inferred and a `@property` rule is registered.

This works across all declaration contexts: component styles, `@keyframes`, global config, and the zero-runtime Babel plugin. It also resolves `var()` chains — if `$a` references `var(--b)`, the type propagates once `--b` is resolved.

Supported types:

| Detection | Inferred syntax |
|-----------|-----------------|
| `1`, `0.5`, `-3` (bare numbers) | `<number>` |
| `10px`, `2rem`, `100vw` (length units) | `<length>` |
| `50%` | `<percentage>` |
| `45deg`, `0.5turn` (angle units) | `<angle>` |
| `300ms`, `1s` (time units) | `<time>` |
| `#name` tokens (by naming convention) | `<color>` |

Auto-inferred properties use `inherits: true` (the CSS default). Use explicit `@property` when you need different settings:

```jsx
// In component styles
styles: {
  '@property': {
    '$scale': { syntax: '<number>', inherits: false, initialValue: 1 },
  },
}

// Or globally
configure({
  properties: {
    '$scale': { syntax: '<number>', inherits: false, initialValue: 1 },
  },
});
```

To disable auto-inference entirely (only explicit `@property` will be used):

```jsx
configure({ autoPropertyTypes: false });
```

---

## Custom Style Handlers

Override or extend the built-in style property handlers. A handler definition can take three forms:

| Form | Syntax | Description |
|------|--------|-------------|
| Function only | `handler` | Triggered by its key name; receives only that property |
| Single dep | `['styleName', handler]` | Triggered by the specified style property |
| Multi dep | `[['dep1', 'dep2', ...], handler]` | Triggered by any of the listed properties; receives all of them |

The multi-dep form is useful when output depends on several style properties together (e.g., `gap` needs to know `display` and `flow` to decide the CSS strategy). Use `defineHandler` for it and the dependency types are inferred from the dependency list, so a typo in the destructure is a type error instead of a silent `undefined`.

```jsx
import { configure, defineHandler, styleHandlers } from '@tenphi/tasty';

configure({
  handlers: {
    // Function only — new single-prop handler
    elevation: ({ elevation }) => {
      const level = parseInt(elevation) || 1;
      return {
        'box-shadow': `0 ${level * 2}px ${level * 4}px rgba(0,0,0,0.1)`,
        'z-index': String(level * 100),
      };
    },

    // Overriding a built-in: declare every style the built-in handled and pass
    // them all through, or the ones you leave out stop working (see below).
    fill: defineHandler(
      [
        'fill', 'backgroundColor', 'image', 'backgroundImage',
        'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
      ],
      (props) => {
        if (typeof props.fill === 'string' && props.fill.startsWith('gradient:')) {
          return { background: props.fill.slice(9) };
        }
        return styleHandlers.fill(props);
      },
    ),

    // Multi dep — handler reads multiple style properties
    gap: defineHandler(['display', 'flow', 'gap'], ({ display, flow, gap }) => {
      if (!gap) return;
      const isGrid = String(display ?? '').includes('grid');
      return { gap: isGrid ? gap : `/* custom logic for ${flow} */` };
    }),
  },
});
```

### Return shape

A handler returns a `CSSMap`, an array of them, or nothing:

- Keys are **kebab-case** CSS property names (`'background-color'`, not `backgroundColor`) or `--custom-property` names. A camelCase key warns in development and is emitted verbatim, which the browser ignores.
- Values are stringified, so numbers are fine (`{ '-webkit-line-clamp': 3 }`).
- The reserved `$` key is a **selector suffix**: `{ $: '& > *:not(:last-child)', 'margin-right': gap }` applies the declarations to a nested selector. It accepts an array to fan out over several.
- Return an array of maps to emit several declaration sets, each with its own `$`.

Values arrive **state-resolved but unparsed** — the raw authored DSL string (`'2x'`, `'#purple.5'`, `true`, `4`). Call the exported `parseStyle()` / `parseColor()` yourself; nothing parses them for you.

### Replacing a built-in handler

Built-in handlers are shared across several style names. Registering a handler for one of those names unregisters the built-in from **all** of them, and the displaced names then fall back to auto-generated CSS aliases — so `hide: true` starts emitting a literal `hide: true` declaration. A development-mode warning lists exactly what was displaced.

The shared groups worth knowing:

| Registering a handler for | Also takes over |
|---|---|
| `fill` | `backgroundColor`, `image`, `backgroundImage`, `backgroundPosition`, `backgroundSize`, `backgroundRepeat` |
| `display` | `hide`, `overflow`, `whiteSpace`, `textOverflow`, `flow`, `gap` |
| `preset` | `font`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `letterSpacing`, `textTransform` |
| `padding` / `margin` / `inset` | their `*Top`/`*Right`/`*Bottom`/`*Left`/`*Block`/`*Inline` longhands |

Either declare the whole group and delegate the rest to `styleHandlers.*`, or pick a name that isn't shared.

### Chunk membership

Tasty renders and caches CSS in independent chunks, and a chunk's cache key covers only its own style values. All of a handler's dependencies must therefore live in one chunk. Custom style names are pulled into their handler's chunk automatically at registration; a handler whose dependencies span two *built-in* chunks (say `fill` and `padding`) warns, because it would be invoked once per chunk with a subset of its inputs.

`configure({ handlers })` must run before the first render, like every other config option.

---

## Props Middleware

`propHandlers` are middleware over a component's props — props in, props out. Where a style *handler* turns a style property into CSS declarations, a prop handler turns a **component prop** into other props, including `styles`. It is the extension point for props whose value isn't a style value.

```jsx
import { configure, mergeStyles } from '@tenphi/tasty';

configure({
  propHandlers: {
    glaze: (props) => {
      const { glaze, ...rest } = props;
      if (!glaze) return rest;

      return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
    },
  },
});

<Element glaze="purple" />
```

The map key is the handler's name and, by default, the prop that triggers it, so an absent prop costs one property check rather than a call. A tuple overrides that: `['glaze', fn]`, `[['glaze', 'tint'], fn]`, or `['*', fn]` for unconditional.

Handlers run at the very top of every component's render, before any prop is destructured, so one can rewrite `styles`, `mods`, `tokens`, `variant`, `as`, `element`, and `qa`. They run in registration order — plugins first, then direct config — each receiving the previous one's output.

Handlers must be **pure** and must not mutate their input, and should memoize the styles they build per input value: style values are cached by object identity, so mutating one in place yields stale CSS, and a reference-stable object avoids re-serializing on every render.

Injected styles occupy the `styles` slot, so they beat a component's own default styles and lose to a style prop at the call site. Prop handlers do not apply to sub-elements or to zero-runtime `tastyStatic()`, which has no props.

See [Plugins → Props middleware](plugins.md#props-middleware) for the full contract and a worked example.

---

## Base Style Props

`baseStyleProps` exposes style properties as props on **every** `tasty()` component, on top of the built-in base styles (`display`, `font`, `preset`, `hide`, `whiteSpace`, `opacity`, `transition`):

```jsx
configure({ baseStyleProps: ['radius', 'shadow'] });

<Card radius="1r" shadow />
```

`configure()` may run after your components are defined — each factory resolves its prop list lazily.

Each name costs one property check per render of every component, and the effect is app-global, so keep the list short and use a factory's own `styleProps` for anything narrower. Avoid names that collide with real DOM or component props (`width`, `size`, `color`), since every component will then swallow them as styles.

---

## Extending Style Types (TypeScript)

Use module augmentation to extend the `StylesInterface`:

```tsx
// tasty.d.ts
declare module '@tenphi/tasty' {
  interface StylesInterface {
    elevation?: string;
    gradient?: string;
  }
}
```

See [Style DSL](dsl.md) for state maps, tokens, units, and extending semantics, and [React API](react-api.md) for `tasty()`, style functions, and component props.
