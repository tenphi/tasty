# Methodology

Tasty has opinions about how components should be structured. The patterns described here are not mandatory — Tasty works without them — but following them gets the most out of the engine: deterministic state resolution, cleaner component APIs, simpler overrides, and fewer surprises as the system grows.

---

## Component architecture: root + sub-elements

This model matters most for design-system authors and platform teams building reusable, stateful components. It turns Tasty's selector guarantees into a component architecture that stays predictable as states, variants, and compound parts accumulate.

### The model

Every Tasty component has a **root element** and zero or more **sub-elements**. The root owns the state context. Sub-elements participate in the same context by default.

```tsx
const Alert = tasty({
  styles: {
    padding: '3x',
    fill: { '': '#surface', 'type=danger': '#danger.10' },
    border: { '': '1bw solid #border', 'type=danger': '1bw solid #danger' },
    radius: '1r',

    Icon: {
      color: { '': '#text-secondary', 'type=danger': '#danger' },
      width: '3x',
      height: '3x',
    },
    Message: {
      preset: 't2',
      color: '#text',
    },
  },
  elements: { Icon: 'span', Message: 'div' },
});
```

When `<Alert mods={{ type: 'danger' }}>` is rendered, the root gets `data-type="danger"` and **all** sub-elements react to it through their state maps. The `Icon` turns `#danger`, the border changes — from a single modifier on the root.

### How this differs from BEM

BEM organizes CSS around blocks, elements, and modifiers. Each element applies its own modifier classes independently:

```html
<!-- BEM: each element carries its own modifier -->
<div class="alert alert--danger">
  <span class="alert__icon alert__icon--danger">!</span>
  <div class="alert__message">Something went wrong</div>
</div>
```

In BEM, `alert__icon--danger` is a separate class that must be applied to the icon element explicitly. The block modifier `alert--danger` does not automatically propagate to elements — each element needs its own modifier class, and the CSS for each element+modifier combination is written separately.

In Tasty, sub-elements inherit the root's state context automatically:

```tsx
<Alert mods={{ type: 'danger' }}>
  <Alert.Icon>!</Alert.Icon>
  <Alert.Message>Something went wrong</Alert.Message>
</Alert>
```

One `mods` prop on the root. No modifier classes on sub-elements. The CSS for `type=danger` is declared once per property, and every sub-element that references that state key reacts to it.

This is the fundamental design choice: **state flows from root to sub-elements**, not from each element independently.

### When sub-elements need their own state

Use `@own(...)` when a sub-element should react to its own state rather than the root's:

```tsx
const Nav = tasty({
  styles: {
    NavItem: {
      color: {
        '': '#text',
        '@own(:hover)': '#primary',
        '@own(:focus-visible)': '#primary',
        'selected': '#primary',
      },
    },
  },
  elements: { NavItem: 'a' },
});
```

Here, `:hover` and `:focus-visible` belong to the individual `NavItem` being hovered, not the root `Nav`. But `selected` is still a root-level modifier — a parent component controls which item is selected.

The default (root state context) is the right choice most of the time. Use `@own()` only when the sub-element has interactive states that are independent of the root.

---

## styleProps as the public API

`styleProps` define which CSS properties a component exposes as typed React props. They are the primary mechanism for product engineers to customize a component without breaking its design constraints.

```tsx
const Space = tasty({
  as: 'div',
  styles: { display: 'flex', flow: 'column', gap: '1x' },
  styleProps: ['flow', 'gap', 'padding', 'fill', 'placeItems', 'placeContent'],
});

// Product engineer uses it:
<Space flow="row" gap="2x" padding="4x" placeItems="center">
```

Style props accept state maps, so responsive values work through the same API:

```tsx
<Space
  flow={{ '': 'column', '@tablet': 'row' }}
  gap={{ '': '2x', '@tablet': '4x' }}
>
```

### Choosing what to expose

Tasty exports predefined style prop lists that group properties by role. Use them instead of hand-picking arrays:

| Preset | Properties | Typical use |
|--------|-----------|-------------|
| `FLOW_STYLES` | flow, gap, columnGap, rowGap, align, justify, placeItems, placeContent, alignItems, alignContent, justifyItems, justifyContent, gridColumns, gridRows, gridTemplate, gridAreas | Layout containers (`Space`, `Grid`) |
| `POSITION_STYLES` | gridArea, gridColumn, gridRow, order, placeSelf, alignSelf, justifySelf, zIndex, margin, inset, position | Positioned elements (`Button`, `Badge`) |
| `DIMENSION_STYLES` | width, height, flexBasis, flexGrow, flexShrink, flex | Sized elements |
| `COLOR_STYLES` | color, fill, fade, image | Color-customizable elements |
| `BLOCK_STYLES` | padding, paddingInline, paddingBlock, overflow, scrollbar, textAlign, border, radius, shadow, outline | Block-level containers |
| `CONTAINER_STYLES` | All of the above combined (+ BASE_STYLES) | Fully flexible containers |
| `OUTER_STYLES` | POSITION_STYLES + DIMENSION_STYLES + block outer (border, radius, shadow, outline) | Components whose outer shell is customizable |
| `INNER_STYLES` | BASE_STYLES + COLOR_STYLES + block inner (padding, overflow, scrollbar) + FLOW_STYLES | Components whose inner layout is customizable |

```tsx
import { tasty, FLOW_STYLES, POSITION_STYLES } from '@tenphi/tasty';

const Space = tasty({
  as: 'div',
  styles: { display: 'flex', flow: 'column', gap: '1x' },
  styleProps: FLOW_STYLES,
});

const Button = tasty({
  as: 'button',
  styles: { padding: '1.5x 3x', fill: '#primary', radius: true },
  styleProps: POSITION_STYLES,
});
```

You can also combine presets or mix them with individual properties:

```tsx
styleProps: [...FLOW_STYLES, ...DIMENSION_STYLES, 'fill'],
```

Match the preset to the component's role:

- **Layout containers** (`Space`, `Box`, `Grid`) — `FLOW_STYLES`, optionally with `DIMENSION_STYLES`
- **Positioned elements** (`Button`, `Badge`) — `POSITION_STYLES`
- **Text elements** — custom: `['preset', 'color']`
- **Compound components** — typically none; styling happens via sub-elements and extension

### The governance trade-off

Exposing every CSS property as a prop defeats the purpose of a design system. The more props a component exposes, the more ways product engineers can deviate from the intended design. A good rule of thumb: expose props that product engineers *need* to adjust for layout and composition, and keep visual identity (colors, borders, typography) controlled through the component definition, variants, or styled wrappers.

---

## modProps and mods

`modProps` expose modifier keys as top-level component props — the modifier equivalent of `styleProps`. Use them when a component has a fixed set of known state modifiers.

```tsx
const Card = tasty({
  modProps: {
    isLoading: Boolean,
    isSelected: Boolean,
  },
  styles: {
    fill: { '': '#surface', isLoading: '#surface.5' },
    border: { '': '1bw solid #outline', isSelected: '2bw solid #primary' },
  },
});

// Clean prop API — no mods object needed
<Card isLoading isSelected>Content</Card>
```

### When to use which

| Pattern | Use when |
|---|---|
| `modProps` | The component has a fixed set of known boolean/string states that drive styles. Provides TypeScript autocomplete and a cleaner JSX API. |
| `mods` prop | The component needs arbitrary or dynamic modifiers that aren't known at definition time. |
| Both | Combine `modProps` for the known states and `mods` for ad-hoc overrides. Mod props take precedence. |
| `styleProps` | Exposing CSS properties (layout, sizing) for customization — different from modifiers. |

### Typed modProps vs array form

The object form gives precise TypeScript types using JS constructors (`Boolean`, `String`, `Number`) or enum arrays:

```tsx
const Button = tasty({
  modProps: {
    isLoading: Boolean,
    size: ['small', 'medium', 'large'] as const,
  },
  // ...
});

// TypeScript knows: isLoading?: boolean, size?: 'small' | 'medium' | 'large'
```

The array form is simpler but types all values as `ModValue`:

```tsx
modProps: ['isLoading', 'isSelected'] as const,
```

For the full API reference, see [Runtime — Mod Props](runtime.md#mod-props).

---

## tokens prop for dynamic values

Every Tasty component accepts a `tokens` prop that renders as inline CSS custom properties on the element. This is the mechanism for per-instance dynamic values.

```tsx
const ProgressBar = tasty({
  styles: {
    width: '100%',
    height: '1x',
    fill: '#surface',
    Bar: {
      width: '$progress',
      height: '100%',
      fill: '#primary',
      transition: 'width 0.3s',
    },
  },
  elements: { Bar: 'div' },
});

// Usage: the progress value comes from a prop, not from styles
<ProgressBar tokens={{ '$progress': `${percent}%` }} />
```

The `tokens` prop sets `style="--progress: 75%"` on the DOM element. The `$progress` reference in styles maps to `var(--progress)`, so the bar width updates without regenerating any CSS.

### When to use tokens vs other mechanisms

| Need | Use |
|------|-----|
| Value changes per instance at render time (progress, user color, avatar size) | `tokens` prop (on component) |
| Value is constant across all instances (card padding, border radius) | `configure({ tokens })` for `:root` CSS custom properties |
| Value should be inlined at parse time (alias for another token) | `configure({ replaceTokens })` |
| Value changes based on component state (hover, disabled, breakpoint) | State map in `styles` |
| Value changes based on a variant (primary, danger, outline) | `variants` option |

Design tokens (via `configure({ tokens })`) are injected as CSS custom properties on `:root`. Replace tokens (via `configure({ replaceTokens })`) are resolved at parse time and baked into the generated CSS. The `tokens` prop on components is resolved at render time via inline CSS custom properties. Use design tokens for design-system constants, replace tokens for value aliases, and the `tokens` prop for truly dynamic per-instance values.

---

## styles prop vs style prop

Tasty components accept both `styles` and `style`, but they serve very different purposes.

### styles — Tasty extension mechanism

The `styles` prop is processed through the full Tasty pipeline. Tokens, custom units, state maps, sub-element keys — everything works:

```tsx
<Card styles={{ padding: '6x', Title: { color: '#danger' } }} />
```

However, **using `styles` directly is discouraged in design-system code.** The recommended pattern is to create a styled wrapper instead:

```tsx
// Preferred: create a styled wrapper
const LargeCard = tasty(Card, {
  styles: { padding: '6x', Title: { color: '#danger' } },
});

<LargeCard />
```

Why? Styled wrappers are:

- **Faster** — styles are parsed and injected once at definition time, not on every render
- **Stable** — the style object is defined once, not recreated on every render
- **Composable** — another engineer can extend `LargeCard` further
- **Inspectable** — the component has a name in React DevTools
- **Lint-friendly** — the ESLint plugin's `no-styles-prop` rule flags direct usage

The `styles` prop exists as an escape hatch — for prototyping, one-off overrides during development, or cases where wrapping is impractical. It should not be the default way product engineers customize components.

### style — React inline styles (escape hatch)

The `style` prop is standard React `CSSProperties`. It bypasses Tasty entirely — no tokens, no units, no state maps:

```tsx
<Card style={{ marginTop: 16 }} />
```

Reserve `style` for third-party library integration where you need to set CSS properties that Tasty does not control (e.g. a library that reads inline `style` for positioning). Never use `style` as a styling mechanism for your own components.

See [Best practices](#best-practices) below for the full list of do's and don'ts.

---

## Wrapping and extension

`tasty(Base, { styles })` is the primary extension mechanism. It creates a new component whose styles are merged with the base component's styles.

```tsx
import { Button } from 'my-ds';

const DangerButton = tasty(Button, {
  styles: {
    fill: { '': '#danger', ':hover': '#danger-hover' },
    color: '#danger-text',
  },
});
```

### Extend mode vs replace mode

Merge behavior depends on whether the child provides a `''` (default) key in a state map:

- **No `''` key** — extend mode: parent states are preserved, child adds or overrides specific states
- **Has `''` key** — replace mode: child defines everything from scratch for that property

```tsx
// Extend: adds `loading` state, overrides `disabled`, keeps parent's '' and ':hover'
tasty(Button, {
  styles: {
    fill: {
      loading: '#yellow',
      disabled: '#gray.20',
    },
  },
});

// Replace: provides '' key, so parent's fill states are dropped entirely
tasty(Button, {
  styles: {
    fill: {
      '': '#danger',
      ':hover': '#danger-hover',
    },
  },
});
```

For full details on merge semantics, `@inherit`, `null`, and `false` tombstones, see [Style DSL — Extending vs. Replacing State Maps](dsl.md#extending-vs-replacing-state-maps).

### When to use styleProps vs wrapping

If the component exposes the properties you need as `styleProps`, use them directly — that is what they are for:

```tsx
// Card exposes padding and gap as styleProps — just use them
<Card padding="2x" gap="1x">
```

Wrapping is for changes that go beyond what `styleProps` expose — overriding colors, adding state mappings, restyling sub-elements:

```tsx
const DangerCard = tasty(Card, {
  styles: {
    border: '1bw solid #danger',
    Title: { color: '#danger' },
  },
});
```

This is preferred over `<Card styles={{ border: '1bw solid #danger' }}>` because:

1. Styles are parsed and injected once, not on every render
2. `DangerCard` can be extended further by others
3. It has a meaningful name in DevTools and code search
4. The ESLint `no-styles-prop` rule encourages this pattern

---

## How configuration simplifies components

Tasty's `configure()` is not just setup — it directly reduces the complexity of every component in the system.

### State aliases eliminate repetition

Without aliases, every component inlines the full query:

```tsx
// Without aliases
padding: { '': '4x', '@media(w < 768px)': '2x' },
flow: { '': 'row', '@media(w < 768px)': 'column' },
```

With aliases:

```tsx
// With aliases
padding: { '': '4x', '@mobile': '2x' },
flow: { '': 'row', '@mobile': 'column' },
```

The alias is defined once. If the breakpoint changes from `768px` to `640px`, you update one line in `configure()` and every component adjusts.

### Recipes extract repeated patterns

Without recipes, every card-like component repeats the same base styles:

```tsx
// Without recipes — repeated in Card, ProfileCard, SettingsPanel, ...
styles: {
  padding: '4x',
  fill: '#surface',
  radius: '1r',
  border: true,
  // ...component-specific styles
}
```

With recipes:

```tsx
// With recipes
styles: {
  recipe: 'card',
  // ...component-specific styles only
}
```

The recipe encapsulates the shared pattern. Change `card`'s radius from `1r` to `2r` and every component using it updates.

### Design tokens enforce consistency

```tsx
configure({
  tokens: {
    '$card-padding': '4x',
    '$input-height': '5x',
  },
});
```

Components use `$card-padding` instead of hardcoding `4x`. If the DS team decides to change card padding, the token is the single source of truth. Tokens support state maps for theme-aware values. Token values are parsed through the Tasty DSL, so you can use units (`4x`), color syntax (`#purple`), and other DSL features in token definitions.

See [Configuration](configuration.md) for the full `configure()` API.

---

## Best practices

### Do

- **Create styled wrappers** instead of passing `styles` directly — faster, composable, inspectable
- **Use design tokens and custom units** (`#text`, `2x`, `1r`) instead of raw CSS values
- **Use semantic transition names** (`transition: 'theme 0.3s'`) instead of listing CSS properties
- **Use `elements` prop** to declare typed sub-components for compound components
- **Use `styleProps`** to define what product engineers can customize
- **Use `modProps`** to expose known modifier states as clean component props
- **Use `tokens` prop** for per-instance dynamic values (progress, user color)
- **Use modifiers** (`mods` or `modProps`) for state-driven style changes instead of runtime `styles` prop changes

### Avoid

### Using raw CSS values when tokens exist

```tsx
// Bad: hardcoded color
fill: 'oklch(55% 0.25 265)',

// Good: token reference
fill: '#primary',
```

Tokens ensure consistency across components and make theme changes a one-line update.

### Using CSS property names when Tasty alternatives exist

```tsx
// Bad: raw CSS properties
backgroundColor: '#fff',
borderRadius: '4px',
flexDirection: 'column',

// Good: Tasty shorthands
fill: '#surface',
radius: '1r',
flow: 'column',
```

Tasty's enhanced properties provide concise syntax, better composability, and simpler overrides. See [recommended props](styles.md#recommended-props) for the full mapping.

### Changing styles prop at runtime

```tsx
// Bad: styles object changes every render
<Card styles={{ padding: isCompact ? '2x' : '4x' }} />

// Good: use modifiers via modProps
<Card isCompact={isCompact} />

// Or via mods object
<Card mods={{ isCompact }} />

// In the component definition:
const Card = tasty({
  modProps: ['isCompact'] as const,
  styles: {
    padding: { '': '4x', isCompact: '2x' },
  },
});
```

Modifiers are compiled into exclusive selectors once. Changing `styles` at runtime forces Tasty to regenerate and re-inject CSS.

### Overusing style prop

```tsx
// Bad: bypassing Tasty for custom styling
<Button style={{ backgroundColor: 'red', padding: '12px 24px' }} />

// Good: create a styled wrapper
const DangerButton = tasty(Button, {
  styles: { fill: '#danger', padding: '1.5x 3x' },
});
```

The `style` prop bypasses tokens, units, and state maps. It should only be used for third-party library integration.

### Skipping elements for compound components

```tsx
// Less ideal: manual data-element attributes
<Card>
  <div data-element="Title">Card Title</div>
  <div data-element="Content">Card content</div>
</Card>

// Better: declare elements for typed sub-components
const Card = tasty({
  styles: {
    Title: { preset: 'h3', color: '#primary' },
    Content: { preset: 't2', color: '#text' },
  },
  elements: { Title: 'h2', Content: 'div' },
});

<Card>
  <Card.Title>Card Title</Card.Title>
  <Card.Content>Card content</Card.Content>
</Card>
```

The `elements` prop gives you typed sub-components with automatic `data-element` attributes, `mods` support, and better discoverability.

---

## Learn more

- **[Getting Started](getting-started.md)** — Installation, first component, tooling setup
- **[Building a Design System](design-system.md)** — Practical guide to building a DS layer with Tasty
- **[Style DSL](dsl.md)** — State maps, tokens, units, extending semantics, keyframes, @property
- **[Runtime API](runtime.md)** — `tasty()` factory, component props, variants, sub-elements, hooks
- **[Configuration](configuration.md)** — Full `configure()` API: tokens, recipes, custom units, style handlers
- **[Style Properties](styles.md)** — Complete reference for all enhanced style properties
- **[Adoption Guide](adoption.md)** — Who should adopt Tasty, incremental phases, what changes for product engineers
