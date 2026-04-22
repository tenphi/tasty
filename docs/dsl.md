# Style DSL Reference

This is the Tasty style language reference — the value syntax, state mappings, tokens, units, extending semantics, and special declarations that apply to both runtime `tasty()` and build-time `tastyStatic()`.

For the runtime React API (`tasty()`, hooks, component props), see [React API](react-api.md). For all enhanced style properties, see [Style Properties](styles.md). For global configuration, see [Configuration](configuration.md).

---

## Dictionary

### Style Mapping

Object where keys represent states and values are the styles to apply:

```jsx
fill: { '': '#white', hovered: '#gray.05', 'theme=danger': '#red' }
```

#### State Key Types

| Syntax | Example | Generated CSS |
|--------|---------|---------------|
| Boolean modifier | `hovered` | `[data-hovered]` |
| Value modifier | `theme=danger` | `[data-theme="danger"]` |
| Pseudo-class | `:hover` | `:hover` |
| Class selector | `.active` | `.active` |
| Attribute selector | `[aria-expanded="true"]` | `[aria-expanded="true"]` |
| Combined (AND) | `hovered & .active` | `[data-hovered].active` |
| Combined (OR) | `hovered \| focused` | `[data-hovered], [data-focused]` |
| Negated (NOT) | `!disabled` | `:not([data-disabled])` |
| Exclusive (XOR) | `hovered ^ focused` | `[data-hovered]:not([data-focused]), :not([data-hovered])[data-focused]` |

Operator precedence (highest to lowest): `!` (NOT) > `^` (XOR) > `|` (OR) > `&` (AND). Use parentheses to override: `hovered & (pressed ^ focused)`.

`^` (XOR) means "exactly one of" — `A ^ B` expands to `(A & !B) | (!A & B)`. This is useful for mutually exclusive states where exactly one should be active:

```jsx
fill: {
  '': '#surface',
  'hovered ^ focused': '#accent',  // active when hovered OR focused, but not both
}
```

### Sub-element

Element styled using a capitalized key. Identified by `data-element` attribute:

```jsx
styles: { Title: { preset: 'h3' } }
// Targets: <div data-element="Title">
```

#### Selector Affix (`$`)

Control how a sub-element selector attaches to the root selector using the `$` property inside the sub-element's styles:

| Pattern | Result | Description |
|---------|--------|-------------|
| *(none)* | ` [el]` | Descendant (default) |
| `>` | `> [el]` | Direct child |
| `>Body>Row>` | `> [Body] > [Row] > [el]` | Chained elements |
| `> SubElementName` | `> [SubElementName]` | Self-name shorthand — when the trailing element name matches the sub-element's own key, it acts as the placeholder (same as `@`); no duplication |
| `h1` | ` h1` | Tag selector (no key injection) |
| `h1 >` | ` h1 > [el]` | Key is direct child of tag |
| `h1 *` | ` h1 *` | Any descendant of tag |
| `*` | ` *` | All descendants |
| `&::before` | `::before` | Root pseudo (no key); `&` is required |
| `&:hover` | `:hover` | Root pseudo-class; `&` is required |
| `@::before` | `[el]::before` | Pseudo on the sub-element |
| `>@:hover` | `> [el]:hover` | Pseudo-class on the sub-element |
| `>@.active` | `> [el].active` | Class on the sub-element |

Rules for key injection (`[data-element="..."]`):

- **Trailing combinator** (`>`, `+`, `~`) — key is injected after it
- **Uppercase element name** (`Body`, `Row`) — key is injected as descendant
- **HTML tag** (`h1`, `a`, `span`) — no key injection; the tag IS the selector
- **Universal selector** (`*`) — no key injection
- **Pseudo / class / attribute** — no key injection

The `@` placeholder marks exactly where `[data-element="..."]` is injected, allowing you to attach pseudo-classes, pseudo-elements, or class selectors directly to the sub-element instead of the root:

```jsx
const List = tasty({
  styles: {
    Item: {
      $: '>@:last-child',
      border: 'none',
    },
  },
});
// → .t0 > [data-element="Item"]:last-child { border: none }
```

### Color Token

Named color prefixed with `#` that maps to CSS custom properties. Supports opacity with `.N` suffix:

```jsx
fill: '#purple.5'  // → var(--purple-color) with 50% opacity
```

### Modifier

State value via `mods` prop that generates `data-*` attributes:

```jsx
mods={{ hovered: true, theme: 'danger' }}
// → data-hovered="" data-theme="danger"
```

Modifiers can also be exposed as top-level component props via `modProps` — see [Runtime — Mod Props](react-api.md#mod-props).

---

## Color Tokens & Opacity

```jsx
color: '#purple',           // Full opacity
color: '#purple.5',         // 50% opacity
color: '#purple.05',        // 5% opacity
fill: '#current',           // → currentcolor
fill: '#current.5',         // → color-mix(in oklab, currentcolor 50%, transparent)
color: '(#primary, #secondary)',  // Fallback syntax
```

---

## Built-in Units

| Unit | Description | Example | CSS Output |
|------|-------------|---------|------------|
| `x` | Gap multiplier | `2x` | `calc(var(--gap) * 2)` |
| `r` | Border radius | `1r` | `var(--radius)` |
| `cr` | Card border radius | `1cr` | `var(--card-radius)` |
| `bw` | Border width | `2bw` | `calc(var(--border-width) * 2)` |
| `ow` | Outline width | `1ow` | `var(--outline-width)` |
| `sf` | Stable fraction | `1sf` | `minmax(0, 1fr)` |

You can register additional custom units via [`configure()`](configuration.md#options).

---

## Replace Tokens

Tokens defined via [`configure({ replaceTokens })`](configuration.md#replace-tokens-parse-time-substitution) are replaced at parse time and baked into the generated CSS:

```jsx
const Card = tasty({
  styles: {
    padding: '$card-padding',
    fill: '#surface',
    border: '1bw solid #accent',
  },
});
```

---

## Recipes

Apply predefined style bundles (defined via [`configure({ recipes })`](configuration.md#recipes)) using the `recipe` style property:

```jsx
const Card = tasty({
  styles: {
    recipe: 'card',
    color: '#text',
  },
});

// Compose multiple recipes
const ElevatedCard = tasty({
  styles: {
    recipe: 'card elevated',
    color: '#text',
  },
});
```

**Post-merge recipes (`/` separator):**

Recipes listed after `/` are applied *after* component styles using `mergeStyles`:

```jsx
const Input = tasty({
  styles: {
    recipe: 'reset input / input-autofill',
    preset: 't3',
  },
});
```

Use `none` to skip base recipes and apply only post recipes:

```jsx
const Custom = tasty({
  styles: {
    recipe: 'none / disabled',
    padding: '2x',
  },
});
```

---

## Extending vs. Replacing State Maps

When a style property uses a state map, the merge behavior depends on whether the child provides a `''` (default) key:

- **No `''` key** — extend mode: parent states are preserved, child adds/overrides
- **Has `''` key** — replace mode: child defines everything from scratch

```jsx
// Parent has: fill: { '': '#white', hovered: '#blue', disabled: '#gray' }

// Extend — no '' key, parent states preserved
const MyButton = tasty(Button, {
  styles: {
    fill: {
      'loading': '#yellow',      // append new state
      'disabled': '#gray.20',    // override existing state in place
    },
  },
});

// Replace — has '' key, parent states dropped
const MyButton = tasty(Button, {
  styles: {
    fill: {
      '': '#red',
      'hovered': '#blue',
    },
  },
});
```

Use `'@inherit'` to pull a parent state value. In extend mode it repositions the state; in replace mode it cherry-picks it:

```jsx
// Extend mode: reposition disabled to end (highest CSS priority)
fill: {
  'loading': '#yellow',
  disabled: '@inherit',
}

// Replace mode: cherry-pick disabled from parent
fill: {
  '': '#red',
  disabled: '@inherit',
}
```

Use `null` inside a state map to remove a state, or `false` to block it entirely (tombstone):

```jsx
fill: { pressed: null }   // removes pressed from the result
fill: { disabled: false } // tombstone — no CSS for disabled, blocks recipe too
```

### Resetting Properties with `null` and `false`

```jsx
const SimpleButton = tasty(Button, {
  styles: {
    fill: null,    // discard parent's fill, let recipe fill in
    border: false, // no border at all (tombstone — blocks recipe too)
  },
});
```

| Value | Meaning | Recipe fills in? |
|-------|---------|-----------------|
| `undefined` | Not provided — parent preserved | N/A |
| `null` | Intentional unset — parent discarded | Yes |
| `false` | Tombstone — blocks everything | No |

---

## Advanced States (`@` prefix)

| Prefix | Purpose | Example |
|--------|---------|---------|
| `@media` | Media queries | `@media(w < 768px)` |
| `@(...)` | Container queries | `@(panel, w >= 300px)` |
| `@supports` | Feature/selector support | `@supports(display: grid)` |
| `@root` | Root element states | `@root(schema=dark)` |
| `@parent` | Parent/ancestor element states | `@parent(hovered)` |
| `@own` | Sub-element's own state | `@own(hovered)` |
| `@starting` | Entry animation | `@starting` |
| `:is()` | CSS `:is()` structural pseudo-class | `:is(fieldset > label)` |
| `:has()` | CSS `:has()` relational pseudo-class | `:has(> Icon)` |
| `:not()` | CSS `:not()` negation (prefer `!:is()`) | `:not(:first-child)` |
| `:where()` | CSS `:where()` (zero specificity) | `:where(Section)` |

### `@media(...)` — Media Queries

Media queries support dimension shorthands and custom unit expansion:

| Shorthand | Expands to |
|-----------|------------|
| `w` | `width` |
| `h` | `height` |

```jsx
fill: {
  '': '#surface',
  '@media(w < 768px)': '#surface-mobile',
  '@media(600px <= w < 1200px)': '#surface-tablet',
  '@media(prefers-color-scheme: dark)': '#surface-dark',
}
```

| Tasty syntax | CSS output |
|--------------|------------|
| `@media(w < 768px)` | `@media (width < 768px)` |
| `@media(600px <= w < 1200px)` | `@media (600px <= width < 1200px)` |
| `@media:print` | `@media print` |
| `@media:screen` | `@media screen` |
| `@media(prefers-color-scheme: dark)` | `@media (prefers-color-scheme: dark)` |
| `@media(prefers-reduced-motion)` | `@media (prefers-reduced-motion)` |

Custom units work inside media queries: `@media(w < 40x)` → `@media (width < calc(var(--gap) * 40))`.

In practice, define state aliases via `configure({ states })` and use `@mobile` instead of writing the full query in every component.

### `@(...)` — Container Queries

Container queries use the syntax `@(name, condition)` for named containers or `@(condition)` for the nearest ancestor container. Dimension shorthands (`w`, `h`, `is`, `bs`) are expanded the same way as `@media`.

| Shorthand | Expands to |
|-----------|------------|
| `w` | `width` |
| `h` | `height` |
| `is` | `inline-size` |
| `bs` | `block-size` |

```jsx
const Panel = tasty({
  styles: {
    flow: {
      '': 'column',
      '@(layout, w >= 600px)': 'row',
    },
  },
});
```

| Tasty syntax | CSS output |
|--------------|------------|
| `@(layout, w < 600px)` | `@container layout (width < 600px)` |
| `@(w < 600px)` | `@container (width < 600px)` |
| `@(layout, $variant=danger)` | `@container layout style(--variant: "danger")` |
| `@(layout, $compact)` | `@container layout style(--compact)` |
| `@(scroll-state(stuck: top))` | `@container scroll-state(stuck: top)` |
| `@(nav, scroll-state(stuck: top))` | `@container nav scroll-state(stuck: top)` |

Container style queries use `$prop` (boolean) or `$prop=value` syntax, which maps to CSS `style(--prop)` or `style(--prop: "value")`.

### `@supports(...)` — Feature Queries

Feature queries test CSS property support. Use `$` as the first argument to test selector support:

| Tasty syntax | CSS output |
|--------------|------------|
| `@supports(display: grid)` | `@supports (display: grid)` |
| `@supports($, :has(*))` | `@supports selector(:has(*))` |
| `!@supports(display: grid)` | `@supports (not (display: grid))` |

```jsx
display: {
  '': 'flex',
  '@supports(display: grid)': 'grid',
}
```

### `@root(...)` — Root Element States

Root states generate selectors on the `:root` element. They are useful for theme modes, feature flags, and other page-level conditions:

These docs use `data-schema` in examples. If your app standardizes on a different root attribute, keep the same pattern and swap the attribute name consistently in your aliases and selectors.

```jsx
color: {
  '': '#text',
  '@root(schema=dark)': '#text-on-dark',
  '@root(.premium-user)': '#gold',
}
```

| Tasty syntax | CSS selector |
|--------------|-------------|
| `@root(schema=dark)` | `:root[data-schema="dark"]` |
| `@root(hovered)` | `:root[data-hovered]` |
| `@root(.premium-user)` | `:root.premium-user` |
| `@root([lang="en"])` | `:root[lang="en"]` |
| `!@root(schema=dark)` | `:root:not([data-schema="dark"])` |

Root conditions are prepended to the component selector: `:root[data-schema="dark"] .t0.t0 { ... }`.

### `@own(...)` — Sub-element's Own State

By default, state keys in sub-element styles refer to the root component's state context. Use `@own(...)` when the sub-element should react to its own state:

```jsx
const Nav = tasty({
  styles: {
    NavItem: {
      color: {
        '': '#text',
        '@own(:hover)': '#primary',
        '@own(:focus-visible)': '#primary',
        'selected': '#primary',       // root-level modifier
      },
    },
  },
  elements: { NavItem: 'a' },
});
```

| Tasty syntax (inside sub-element) | CSS output |
|-----------------------------------|------------|
| `@own(:hover)` | `:hover` on the sub-element selector |
| `@own(hovered)` | `[data-hovered]` on the sub-element selector |
| `@own(theme=dark)` | `[data-theme="dark"]` on the sub-element selector |

`@own()` is only valid inside sub-element styles. Using it on root styles emits a warning and is treated as a regular modifier.

### `@starting` — Entry Animation

Wraps the rule in `@starting-style`, enabling CSS entry animations for elements as they appear in the DOM:

```jsx
const FadeIn = tasty({
  styles: {
    opacity: { '': '1', '@starting': '0' },
    transform: { '': 'scale(1)', '@starting': 'scale(0.95)' },
    transition: 'opacity 0.3s, translate 0.3s',
  },
});
```

| Tasty syntax | CSS output |
|--------------|------------|
| `@starting` | `@starting-style { .t0.t0 { ... } }` |

### `@parent(...)` — Parent Element States

Style based on ancestor element attributes. Uses `:is([selector] *)` / `:not([selector] *)` for symmetric, composable parent checks. Boolean logic (`&`, `|`, `!`, `^`) is supported inside `@parent()`.

```jsx
const Highlight = tasty({
  styles: {
    fill: {
      '': '#white',
      '@parent(hovered)': '#gray.05',         // Any ancestor has [data-hovered]
      '@parent(theme=dark, >)': '#dark-02',   // Direct parent has [data-theme="dark"]
    },
  },
});
```

| Syntax | CSS Output |
|--------|------------|
| `@parent(hovered)` | `:is([data-hovered] *)` |
| `!@parent(hovered)` | `:not([data-hovered] *)` |
| `@parent(hovered, >)` | `:is([data-hovered] > *)` (direct parent) |
| `@parent(.active)` | `:is(.active *)` |
| `@parent(hovered & focused)` | `:is([data-hovered][data-focused] *)` (same ancestor) |
| `@parent(hovered) & @parent(focused)` | `:is([data-hovered] *):is([data-focused] *)` (independent ancestors) |
| `@parent(hovered \| focused)` | `:is([data-hovered] *, [data-focused] *)` (OR inside single wrapper) |

For sub-elements, the parent check applies to the root element's ancestors:

```jsx
const Card = tasty({
  styles: {
    Label: {
      color: {
        '': '#text',
        '@parent(hovered)': '#primary',
      },
    },
  },
});
// → .t0.t0:is([data-hovered] *) [data-element="Label"]
```

### `:is()`, `:has()` — CSS Structural Pseudo-classes

Use CSS structural pseudo-classes directly in state keys. Capitalized words become `[data-element="..."]` selectors; lowercase words are HTML tags. A trailing combinator (`>`, `+`, `~`) is auto-completed with `*`.

`:where()` and `:not()` are also supported but rarely needed — use `:is()` and `!` negation instead.

> **Performance warning:** CSS structural pseudo-classes — especially `:has()` — can be costly for the browser to evaluate because they require inspecting the DOM tree beyond the matched element. Tasty already provides a rich, purpose-built state system (`@parent()`, `@own()`, modifiers, boolean logic) that covers the vast majority of use cases without the performance trade-off. **Prefer Tasty's built-in mechanisms and treat `:has()` / `:is()` as a last resort** for conditions that cannot be expressed any other way.

```jsx
const Card = tasty({
  styles: {
    display: {
      '': 'block',
      ':has(> Icon)': 'grid',              // has Icon as direct child
      ':has(+ Icon)': 'grid',              // immediately followed by an Icon sibling
      ':has(~ Icon)': 'grid',              // has an Icon sibling somewhere after
      ':has(Icon +)': 'grid',              // immediately preceded by an Icon sibling (auto-completes to `Icon + *`)
      ':has(Icon ~)': 'grid',              // has an Icon sibling somewhere before (auto-completes to `Icon ~ *`)
      ':is(fieldset > label)': 'inline',   // is a label inside a fieldset (HTML tags)
      '!:has(> Icon)': 'flex',             // negation: no Icon child
    },
  },
});
```

| Syntax | CSS Output | Meaning |
|--------|------------|---------|
| `:has(> Icon)` | `:has(> [data-element="Icon"])` | Has Icon as direct child |
| `:has(+ Icon)` | `:has(+ [data-element="Icon"])` | Immediately followed by an Icon sibling |
| `:has(~ Icon)` | `:has(~ [data-element="Icon"])` | Has an Icon sibling somewhere after |
| `:has(Icon +)` | `:has([data-element="Icon"] + *)` | Immediately preceded by an Icon sibling |
| `:has(Icon ~)` | `:has([data-element="Icon"] ~ *)` | Has an Icon sibling somewhere before |
| `:has(>)` | `:has(> *)` | Has any direct child |
| `:is(> Field + input)` | `:is(> [data-element="Field"] + input)` | Structural match |
| `:has(button)` | `:has(button)` | HTML tag (lowercase, unchanged) |
| `!:has(> Icon)` | `:not(:has(> [data-element="Icon"]))` | Negation (use `!`) |
| `!:is(Panel)` | `:not([data-element="Panel"])` | Negation (use `!:is`) |

Combine with other states using boolean logic (`&`, `|`, `!`, `^`):

```jsx
':has(> Icon) & hovered'                // AND: structural + data attribute
'@parent(hovered) & :has(> Icon)'       // AND: parent check + structural
':has(> Icon) | :has(> Button)'         // OR: either sub-element present
':has(> Icon) ^ :has(> Button)'         // XOR: exactly one present
```

> **Nesting limit:** The state key parser supports up to 2 levels of nested parentheses inside `:is()`, `:has()`, `:not()`, and `:where()` — e.g. `:has(Input:not(:disabled))` works, but 3+ levels like `:has(:is(:not(:hover)))` will not be tokenized correctly. This covers virtually all practical use cases.

---

## Keyframes

Define animations inline using the `@keyframes` key in styles:

```jsx
const Pulse = tasty({
  styles: {
    animation: 'pulse 2s infinite',
    '@keyframes': {
      pulse: {
        '0%, 100%': { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.05)' },
      },
    },
  },
});
```

---

## Properties (`@property`)

CSS cannot transition or animate custom properties unless the browser knows their type. Tasty solves this automatically — when you assign a concrete value to a custom property, the type is inferred and a CSS `@property` rule is registered behind the scenes:

```jsx
const AnimatedGradient = tasty({
  styles: {
    '$gradient-angle': '0deg',
    '#theme': 'okhsl(280 80% 50%)',
    background: 'linear-gradient($gradient-angle, #theme, transparent)',
    transition: '$$gradient-angle 0.3s, ##theme 0.3s',
  },
});
```

Here `$gradient-angle: '0deg'` is detected as `<angle>` and `#theme` as `<color>` (via the `#name` naming convention), so both transitions work without any manual `@property` declarations. Numeric types (`<number>`, `<length>`, `<percentage>`, `<angle>`, `<time>`) are inferred from values; `<color>` is inferred from `#name` tokens.

Use explicit `@properties` when you need non-default settings like `inherits: false`:

```jsx
'@properties': {
  '$gradient-angle': { syntax: '<angle>', inherits: false, initialValue: '0deg' },
},
```

---

## Font Face (`@fontFace`)

Register custom fonts directly inside a `styles` object. Keys are font-family names, values are descriptor objects (or arrays of them for multiple weights/styles).

```ts
const Heading = tasty({
  styles: {
    '@fontFace': {
      'Brand Sans': {
        src: 'url("/fonts/brand-sans.woff2") format("woff2")',
        fontDisplay: 'swap',
      },
    },
    fontFamily: '"Brand Sans", sans-serif',
  },
});
```

### Multiple weights

Supply an array to register several variants of the same family:

```ts
'@fontFace': {
  'Brand Sans': [
    { src: 'url("/fonts/brand-regular.woff2") format("woff2")', fontWeight: 400, fontDisplay: 'swap' },
    { src: 'url("/fonts/brand-bold.woff2") format("woff2")', fontWeight: 700, fontDisplay: 'swap' },
  ],
}
```

### Supported descriptors

| Descriptor | CSS property | Type |
|---|---|---|
| `src` (required) | `src` | `string` |
| `fontWeight` | `font-weight` | `string \| number` |
| `fontStyle` | `font-style` | `string` |
| `fontStretch` | `font-stretch` | `string` |
| `fontDisplay` | `font-display` | `'auto' \| 'block' \| 'swap' \| 'fallback' \| 'optional'` |
| `unicodeRange` | `unicode-range` | `string` |
| `ascentOverride` | `ascent-override` | `string` |
| `descentOverride` | `descent-override` | `string` |
| `lineGapOverride` | `line-gap-override` | `string` |
| `sizeAdjust` | `size-adjust` | `string` |
| `fontFeatureSettings` | `font-feature-settings` | `string` |
| `fontVariationSettings` | `font-variation-settings` | `string` |

> Font-face rules are permanent — they are injected once and never cleaned up, matching how browsers handle `@font-face`.

---

## Counter Style (`@counterStyle`)

Define custom list markers via the CSS `@counter-style` at-rule. Keys are counter-style names, values are descriptor objects.

```ts
const EmojiList = tasty({
  tag: 'ol',
  styles: {
    '@counterStyle': {
      thumbs: {
        system: 'cyclic',
        symbols: '"👍"',
        suffix: '" "',
      },
    },
    listStyleType: 'thumbs',
  },
});
```

### Supported descriptors

| Descriptor | CSS property | Type |
|---|---|---|
| `system` (required) | `system` | `'cyclic' \| 'numeric' \| 'alphabetic' \| 'symbolic' \| 'additive' \| 'fixed' \| string` |
| `symbols` | `symbols` | `string` |
| `additiveSymbols` | `additive-symbols` | `string` |
| `prefix` | `prefix` | `string` |
| `suffix` | `suffix` | `string` |
| `negative` | `negative` | `string` |
| `range` | `range` | `string` |
| `pad` | `pad` | `string` |
| `fallback` | `fallback` | `string` |
| `speakAs` | `speak-as` | `string` |

> Counter-style rules are permanent — they are injected once and never cleaned up, matching how browsers handle `@counter-style`.

---

## Style Properties

For a complete reference of all enhanced style properties — syntax, values, modifiers, and recommendations — see **[Style Properties Reference](styles.md)**.

---

## Learn more

- **[React API](react-api.md)** — `tasty()` factory, component props, variants, sub-elements, style functions
- **[Methodology](methodology.md)** — Recommended patterns: root + sub-elements, styleProps, tokens, wrapping
- **[Configuration](configuration.md)** — Tokens, recipes, custom units, style handlers, TypeScript extensions
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
- **[Zero Runtime (tastyStatic)](tasty-static.md)** — Build-time static styling with Babel plugin
