# Tasty Style Helper

`tasty` is a powerful utility for creating styled React components with a declarative, design-system-integrated API. It combines the flexibility of CSS-in-JS with the consistency of a design system, enabling you to build maintainable, themeable components quickly.

---

## Quick Start

### Creating Your First Component

```jsx
import { tasty } from '@tenphi/tasty';

// Basic styled component
const Card = tasty({
  as: 'div',
  styles: {
    padding: '4x',
    fill: '#white',
    border: true,
    radius: true,
  },
  styleProps: ['padding', 'fill'], // Expose styles as props
});

// Usage
<Card>Hello World</Card>
<Card padding="6x" fill="#gray.05">Custom Card</Card>
```

### Extending Existing Components

> **Best Practice:** Always prefer creating styled wrappers over using the `styles` prop directly.

```jsx
// Recommended
const PrimaryButton = tasty(Button, {
  styles: {
    fill: '#purple',
    color: '#white',
    padding: '2x 4x',
  },
});

// Avoid
<Button styles={{ fill: '#purple' }}>Click me</Button>
```

#### Extending vs. Replacing State Maps

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

#### Resetting Properties with `null` and `false`

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

### Essential Patterns

```jsx
// State-based styling
const InteractiveCard = tasty({
  styles: {
    fill: {
      '': '#white',
      'hovered': '#gray.05',
      'pressed': '#gray.10',
    },
  },
});

// Using design tokens
const TokenCard = tasty({
  styles: {
    fill: '#surface',      // Color token
    color: '#text',        // Color token
    padding: '2x',         // Custom unit (gap × 2)
    radius: '1r',          // Custom unit (border-radius)
    border: '1bw solid #border', // Border width token
  },
});
```

---

## Configuration

Configure the Tasty style system before your app renders using the `configure()` function. Configuration must be done **before any styles are generated** (before first render).

```jsx
import { configure } from '@tenphi/tasty';

configure({
  // CSP nonce for style elements
  nonce: 'abc123',

  // Global state aliases
  states: {
    '@mobile': '@media(w < 768px)',
    '@tablet': '@media(768px <= w < 1024px)',
    '@dark': '@root(theme=dark)',
  },

  // Parser configuration
  parserCacheSize: 2000, // LRU cache size (default: 1000)

  // Custom units (merged with built-in units)
  units: {
    vh: 'vh',
    vw: 'vw',
    custom: (n) => `${n * 10}px`, // Function-based unit
  },

  // Custom functions for the parser
  funcs: {
    double: (groups) => {
      const value = parseFloat(groups[0]?.output || '0');
      return `${value * 2}px`;
    },
  },
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nonce` | `string` | - | CSP nonce for style elements |
| `states` | `Record<string, string>` | - | Global state aliases for advanced state mapping |
| `parserCacheSize` | `number` | `1000` | Parser LRU cache size |
| `units` | `Record<string, string \| Function>` | Built-in | Custom units (merged with built-in) |
| `funcs` | `Record<string, Function>` | - | Custom parser functions (merged with existing) |
| `handlers` | `Record<string, StyleHandlerDefinition>` | Built-in | Custom style handlers (replace built-in) |
| `tokens` | `Record<string, string \| number>` | - | Predefined tokens replaced during parsing |
| `keyframes` | `Record<string, KeyframesSteps>` | - | Global keyframes for animations |
| `properties` | `Record<string, PropertyDefinition>` | - | Global CSS @property definitions |
| `recipes` | `Record<string, RecipeStyles>` | - | Predefined style recipes (named style bundles) |

### Predefined Tokens

Define reusable tokens that are replaced during style parsing. Unlike component-level `tokens` prop (which renders as inline CSS custom properties), predefined tokens are baked into the generated CSS.

```jsx
configure({
  tokens: {
    $spacing: '2x',
    '$card-padding': '4x',
    '$button-height': '40px',
    '#accent': '#purple',
    '#surface': '#white',
    '#surface-hover': '#gray.05',
  },
});

const Card = tasty({
  styles: {
    padding: '$card-padding',
    fill: '#surface',
    border: '1bw solid #accent',
  },
});
```

### Recipes

Recipes are predefined, named style bundles that can be applied to any component via the `recipe` style property.

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

// Apply a single recipe
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

**Post-merge recipes (`|` separator):**

Recipes listed after `|` are applied *after* component styles using `mergeStyles`:

```jsx
const Input = tasty({
  styles: {
    recipe: 'reset input | input-autofill',
    preset: 't3',
  },
});
```

### Built-in Units

| Unit | Description | Example | CSS Output |
|------|-------------|---------|------------|
| `x` | Gap multiplier | `2x` | `calc(var(--gap) * 2)` |
| `r` | Border radius | `1r` | `var(--radius)` |
| `cr` | Card border radius | `1cr` | `var(--card-radius)` |
| `bw` | Border width | `2bw` | `calc(var(--border-width) * 2)` |
| `ow` | Outline width | `1ow` | `var(--outline-width)` |
| `fs` | Font size | `1fs` | `var(--font-size)` |
| `lh` | Line height | `1lh` | `var(--line-height)` |
| `sf` | Stable fraction | `1sf` | `minmax(0, 1fr)` |

### Custom Style Handlers

```jsx
import { configure, styleHandlers } from '@tenphi/tasty';

configure({
  handlers: {
    fill: ({ fill }) => {
      if (fill?.startsWith('gradient:')) {
        return { background: fill.slice(9) };
      }
      return styleHandlers.fill({ fill });
    },
    elevation: ({ elevation }) => {
      const level = parseInt(elevation) || 1;
      return {
        'box-shadow': `0 ${level * 2}px ${level * 4}px rgba(0,0,0,0.1)`,
        'z-index': String(level * 100),
      };
    },
  },
});
```

### Extending Style Types (TypeScript)

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
| Combined | `hovered & .active` | `[data-hovered].active` |

### Sub-element

Element styled using a capitalized key. Identified by `data-element` attribute:

```jsx
styles: { Title: { preset: 'h3' } }
// Targets: <div data-element="Title">
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

---

## Core Concepts

### Component Creation

```jsx
// Create new element
const Box = tasty({
  as: 'div',
  styles: { /* styles */ },
});

// Extend existing component
const StyledButton = tasty(Button, {
  styles: { /* additional styles */ },
});
```

### Style Props

Use `styleProps` to expose style properties as direct component props:

```jsx
const FlexibleBox = tasty({
  as: 'div',
  styles: {
    display: 'flex',
    padding: '2x',
  },
  styleProps: ['gap', 'align', 'placeContent', 'fill'],
});

<FlexibleBox gap="2x" align="center" fill="#surface">
  Content
</FlexibleBox>
```

### Color Tokens & Opacity

```jsx
color: '#purple',           // Full opacity
color: '#purple.5',         // 50% opacity
color: '#purple.05',        // 5% opacity
fill: '#current',           // → currentcolor
fill: '#current.5',         // → color-mix(in oklab, currentcolor 50%, transparent)
color: '(#primary, #secondary)',  // Fallback syntax
```

### Advanced States (`@` prefix)

| Prefix | Purpose | Example |
|--------|---------|---------|
| `@media` | Media queries | `@media(w < 768px)` |
| `@(...)` | Container queries | `@(panel, w >= 300px)` |
| `@supports` | Feature/selector support | `@supports(display: grid)` |
| `@root` | Root element states | `@root(theme=dark)` |
| `@parent` | Parent/ancestor element states | `@parent(hovered)` |
| `@own` | Sub-element's own state | `@own(hovered)` |
| `@starting` | Entry animation | `@starting` |

#### `@parent(...)` — Parent Element States

Style based on ancestor element attributes. Uses `:is([selector] *)` / `:not([selector] *)` for symmetric, composable parent checks.

```jsx
const Highlight = tasty({
  styles: {
    fill: {
      '': '#white',
      '@parent(hovered)': '#gray.05',         // Any ancestor has [data-hovered]
      '@parent(theme=dark >)': '#dark-02',     // Direct parent has [data-theme="dark"]
    },
  },
});
```

| Syntax | CSS Output |
|--------|------------|
| `@parent(hovered)` | `:is([data-hovered] *)` |
| `!@parent(hovered)` | `:not([data-hovered] *)` |
| `@parent(hovered >)` | `:is([data-hovered] > *)` (direct parent) |
| `@parent(.active)` | `:is(.active *)` |
| `@parent(hovered) & @parent(focused)` | `:is([data-hovered] *):is([data-focused] *)` (independent ancestors) |

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

---

## Style Properties Reference

### Layout Properties

- `display` — Standard CSS display values. `hide: true` as shortcut for `display: none`
- `flow` — Unified flex/grid direction control
- `gap` — Element spacing across all layout types
- `padding` / `margin` — Enhanced syntax with directional modifiers (`top`, `right`, `bottom`, `left`)
- `width` / `height` — With min/max/fixed modifiers and intrinsic sizing

### Visual Properties

- `color` / `fill` — Color tokens with opacity, dual-fill support
- `border` — Enhanced syntax with directional support
- `radius` — Border radius with shape modifiers (`round`, `ellipse`, `leaf`)
- `outline` — Focus outline with offset support
- `image` — Background images

### Typography Properties

- `preset` — Semantic typography shortcuts (`h1`–`h6`, `t1`–`t4`, `p1`–`p4`, etc.)
- `textOverflow` — Text truncation with ellipsis or multi-line clamping

### Advanced Properties

- `transition` — Semantic transition names (`fill`, `theme`, `border`, etc.)
- `scrollbar` — Scrollbar styling (`thin`, `none`, `styled`, custom colors)
- `fade` — Edge fading with gradient masks

---

## Advanced Features

### Keyframes

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

### Properties (`@property`)

```jsx
const AnimatedGradient = tasty({
  styles: {
    '@properties': {
      '$gradient-angle': {
        syntax: '<angle>',
        inherits: false,
        initialValue: '0deg',
      },
      '#theme': {
        initialValue: 'purple',
      },
    },
    background: 'linear-gradient($gradient-angle, #theme, transparent)',
    transition: '$$gradient-angle 0.3s, ##theme 0.3s',
  },
});
```

### Variants & Theming

```jsx
const Button = tasty({
  styles: {
    padding: '2x 4x',
    border: true,
  },
  variants: {
    default: { fill: '#blue', color: '#white' },
    danger: { fill: '#red', color: '#white' },
    outline: { fill: 'transparent', color: '#blue', border: '1bw solid #blue' },
  },
});

<Button variant="danger">Delete</Button>
```

### Sub-element Styling

```jsx
const Card = tasty({
  styles: {
    padding: '4x',
    Title: { preset: 'h3', color: '#primary' },
    Content: { color: '#text' },
  },
});

<Card>
  <div data-element="Title">Card Title</div>
  <div data-element="Content">Card content</div>
</Card>
```

#### Selector Affix (`$`)

Control sub-element selector combinator:

| Pattern | Result | Description |
|---------|--------|-------------|
| *(none)* | ` [el]` | Descendant (default) |
| `>` | `> [el]` | Direct child |
| `>Body>Row>` | `> [Body] > [Row] > [el]` | Chained elements |
| `::before` | `::before` | Root pseudo (no key) |

---

## Hooks

### useStyles

```tsx
import { useStyles } from '@tenphi/tasty';

function MyComponent() {
  const { className } = useStyles({
    padding: '2x',
    fill: '#surface',
    radius: '1r',
  });

  return <div className={className}>Styled content</div>;
}
```

### useGlobalStyles

```tsx
import { useGlobalStyles } from '@tenphi/tasty';

function ThemeStyles() {
  useGlobalStyles('.card', {
    padding: '4x',
    fill: '#surface',
    radius: '1r',
  });

  return null;
}
```

### useRawCSS

```tsx
import { useRawCSS } from '@tenphi/tasty';

function GlobalReset() {
  useRawCSS(`
    body { margin: 0; padding: 0; }
  `);

  return null;
}
```

### useMergeStyles

```tsx
import { useMergeStyles } from '@tenphi/tasty';

function MyTabs({ styles, tabListStyles, prefixStyles }) {
  const mergedStyles = useMergeStyles(styles, {
    TabList: tabListStyles,
    Prefix: prefixStyles,
  });

  return <TabsElement styles={mergedStyles} />;
}
```

---

## Best Practices

### Do's

- Use styled wrappers instead of `styles` prop directly
- Use design tokens and custom units (`#text`, `2x`, `1r`)
- Use semantic transition names (`theme 0.3s`)
- Use sub-element styling for inner elements
- Use `styleProps` for component APIs
- Use `tokens` prop for dynamic values

### Don'ts

- Don't use `styles` prop directly on components
- Don't use raw CSS values when tokens exist
- Don't use CSS property names when Tasty alternatives exist (`fill` not `backgroundColor`)
- Don't change `styles` prop at runtime (use modifiers or tokens instead)
- Don't use `style` prop for custom styling (only for third-party library integration)

| Native CSS | Tasty Alternative |
|------------|-------------------|
| `backgroundColor` | `fill` |
| `borderColor/Width/Style` | `border` |
| `borderRadius` | `radius` |
| `maxWidth` | `width: "max 100%"` |
| `minWidth` | `width: "min 200px"` |
