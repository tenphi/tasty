# Tasty Style Rules for AI Agents

A compact ruleset for **writing correct `@tenphi/tasty` styles**. It is not an API tour — most rules here are machine-checked by [`@tenphi/eslint-plugin-tasty`](https://www.npmjs.com/package/@tenphi/eslint-plugin-tasty), so following it generally means clean lint output. The plugin ships separately and can lag a new DSL rule, so treat this page as the source of truth and the plugin as the enforcement that catches most of it. For explanations and the complete API, see [Style DSL](dsl.md), [Style Properties](styles.md), [React API](react-api.md).

Notation: ❌ wrong → ✅ correct.

---

## 0. Read the project config first

Color tokens (`#name`), custom properties (`$name`), `preset` names, `recipe` names, state aliases (`@mobile`) and extra units are **project-defined** in `tasty.config.ts` or a `configure({ … })` call. Look them up before writing styles. Never invent a name — reuse an existing one, or add it to the config.

## 1. Where styles go

```jsx
const Card = tasty({ as: 'div', styles: { … }, styleProps: ['padding'] }); // new component
const Hero = tasty(Card, { styles: { … } });                              // extend a component
const cls = useStyles({ … });                                             // ad-hoc class name
tastyStatic('.card', { … });                                              // build-time, zero runtime
```

- Wrap, don't pass styles per instance: ❌ `<Box styles={{ padding: '2x' }} />` → ✅ `const Box = tasty({ styles: { padding: '2x' } })`.
- Style values are **static**. Route anything conditional through a state map plus `mods` (or `tokens` / `styleProps`):
  ❌ `fill: isOpen ? '#primary' : '#surface'` → ✅ `fill: { '': '#surface', open: '#primary' }` with `mods={{ open: isOpen }}`.

## 2. Property names

Keys are camelCase — a Tasty property or a real CSS property. No kebab-case, no invented names.

Prefer the Tasty shorthand over its CSS equivalents:

| Use | Instead of |
|-----|------------|
| `fill` | `backgroundColor`, `background` |
| `image` | `backgroundImage` |
| `border` | `borderColor`, `borderWidth`, `borderStyle`, `borderTop`/`Right`/`Bottom`/`Left` |
| `radius` | `borderRadius` |
| `outline` | `outlineColor`, `outlineWidth`, `outlineStyle`, `outlineOffset` |
| `shadow` | `boxShadow` |
| `padding` | `paddingTop`/`Right`/`Bottom`/`Left` |
| `margin` | `marginTop`/`Right`/`Bottom`/`Left` |
| `inset` | `top`, `right`, `bottom`, `left` |
| `width` / `height` | `minWidth`/`maxWidth`, `minHeight`/`maxHeight` |
| `flow` | `flexDirection`, `flexWrap`, `flexFlow`, `gridAutoFlow` |
| `preset` | `fontSize`, `lineHeight`, `letterSpacing`, `fontWeight`, `fontStyle`, `textTransform` |
| `font` | `fontFamily` |
| `scrollbar` | `scrollbarWidth`, `scrollbarColor`, `scrollbarGutter` |
| `gridColumns` / `gridRows` / `gridAreas` | `gridTemplateColumns` / `Rows` / `Areas` |
| `textOverflow: 'ellipsis / 3'` | `lineClamp` |
| `hide: true` | `display: 'none'` |
| `flexGrow` / `flexShrink` / `flexBasis` | `flex` |

The last row goes the other way — longhands over the shorthand — because `flex` is lossy: it resets the components you omit to non-initial values (`flex: '0'` silently sets `flex-basis: 0%`) and cannot express `flexShrink: 0` at all. The longhands also carry separate state maps.

## 3. Values

### Tokens

| Syntax | Meaning |
|--------|---------|
| `#name` | color token → `var(--name-color)` |
| `#name.50` | token at 50% opacity (`0`–`100`) |
| `#name.$opacity` | opacity from a custom property |
| `#clear` / `#current` | `transparent` / `currentcolor` |
| `$name` | custom property → `var(--name)` |
| `(#a, #b)` | fallback chain |
| `$$name` / `##name` | the custom property *name* (not its value) — inside `transition` |
| `$$name(…)` | call a CSS `@function` declared via `@function`, `useFunction`, or config |

- ❌ `#f5f5f5`, `rgb(0 0 0)`, `oklch(…)`, `okhsl(…)`, `red` → ✅ `#surface` (add the token to the config if it doesn't exist).
- ❌ `var(--gap)` → ✅ `$gap` · ❌ `$accent-color` → ✅ `#accent` · ❌ `transparent` → ✅ `#clear` · ❌ `currentColor` → ✅ `#current`.
- A `$name` must be declared as a `'$name': value` key in the same styles object, or in the config.

### Units

Tasty units: `x` (gap multiple), `r` (radius), `cr` (card radius), `bw` (border width), `ow` (outline width), `sf` (`minmax(0, Nfr)`). All CSS units work too, plus anything in `units` in the config. Any other unit is an error.

Prefer units over raw pixels: `8px` → `1x` … `64px` → `8x`; `radius: '6px'` → `'1r'`; `border: '1px …'` → `'1bw …'`.

### Math

❌ `calc(100% - 2x)` → ✅ `(100% - 2x)`. Parentheses are wrapped in `calc()` automatically — and must be balanced.

### `true`

`true` means "the design-system default" and is accepted **only** by: `border`, `radius`, `outline`, `shadow`, `padding`, `margin`, `gap`, `inset`, `width`, `height`, `fill`, `color`, `preset`, `font`, `scrollbar`, `hide`. Anywhere else it is an error.

### `!important`

Never use it. Tasty owns specificity through doubled selectors and state ordering; `!important` breaks that. Express the exception as a state instead.

### Modifiers

A value is `[values…] [modifiers…]`, and several groups can be comma-separated (later groups override earlier ones). A group that names **direction** modifiers takes a **single** value, applied to every direction it names — per-side values come from comma groups. A group naming no direction keeps plain CSS shorthand order (1–4 values). (`inset` + `dock` is the one exception: a second value insets the spanned sides.) Only the modifiers a property knows are valid:

| Property | Modifiers |
|----------|-----------|
| `padding`, `margin`, `inset`, `fade` | `top` `right` `bottom` `left` |
| `border` | the four directions + `solid` `dashed` `dotted` `double` `groove` `ridge` `inset` `outset` `none` `hidden` |
| `outline` | the style keywords above |
| `radius` | `top` `right` `bottom` `left` + shapes `round` `ellipse` `leaf` `backleaf` |
| `width`, `height` | `min` `max` `fixed` |
| `flow` | `row` `column` `row-reverse` `column-reverse` `wrap` `nowrap` `dense` |
| `overflow` | `visible` `hidden` `scroll` `clip` `auto` `overlay` |
| `position` | `static` `relative` `absolute` `fixed` `sticky` |
| `shadow` | `inset` |
| `preset` | `name / strong` (or `bold`) `italic` `icon` `tight` |
| box properties | `longhand` — emit CSS longhands instead of the shorthand |

Directional modifiers beat placeholder zeros:

- ❌ `padding: '0 0 2x 0'` → ✅ `padding: '2x bottom'`
- ❌ `padding: '1x 1x 2x 1x'` → ✅ `padding: '1x, 2x bottom'`
- ❌ `border: '0 0 1bw 0'` — four tokens parse as *one* border value, so this renders no border at all → ✅ `border: '1bw bottom'`
- ❌ `padding: '2x 4x top right'` — a directional group takes one value, so `4x` is dropped → ✅ `padding: '2x top, 4x right'`
- ❌ `fade: '3x 1x top bottom'` → ✅ `fade: '3x top, 1x bottom'`

Value-only properties reject both colors and modifiers: `gap`, `columnGap`, `rowGap`, `opacity`, `zIndex`, `order`, `flexGrow`, `flexShrink`, `flexBasis`, `aspectRatio`, `lineClamp`, `tabSize`, `paddingInline`, `paddingBlock`. `fill` and `color` take a color (plus `none` / `transparent`); `caretColor` and `accentColor` take a color only.

### `transition`

Use semantic names, not CSS property names: `fade` `fill` `color` `theme` `border` `radius` `shadow` `outline` `preset` `text` `gap` `opacity` `translate` `rotate` `scale` `filter` `image` `background` `width` `height` `zIndex` `inset` `flow` `dimension`.

❌ `transition: 'background-color 0.2s'` → ✅ `transition: 'fill 0.2s'`

## 4. State maps

A property value can be an object of `state: value`. Key order is priority — later keys win.

| Key | Generated selector |
|-----|--------------------|
| `hovered` | `[data-hovered]` (boolean modifier from `mods`) |
| `theme=danger` | `[data-theme="danger"]` (value modifier) |
| `:hover` | pseudo-class |
| `.active` | class selector |
| `[aria-expanded="true"]` | attribute selector |
| `hovered & .active` | AND |
| `hovered \| focused` | OR (`,` also means OR) |
| `!disabled` | NOT |
| `hovered ^ focused` | XOR — exactly one (keep chains ≤ 4 operands) |

Precedence `!` > `^` > `|` > `&`; use parentheses to override.

Rules:

1. **`''` comes first.** The bare default is the lowest-priority state; placing it later would override everything above it.
2. **Every state map needs `''` or `_`** — except when extending (`tasty(Parent, …)`), where omitting `''` merges into the parent's states and including `''` replaces them wholesale.
3. **`_` is standalone-only** and always first (with `''` right after it, if present). `_` is a never-negated fallback floor for cases where a higher-priority branch may be *unknown* (`@supports`, container queries). If a map contains only `_` and `''`, drop the `''`.
4. **No nested maps:** ❌ `{ hovered: { pressed: 'x' } }` → ✅ `{ 'hovered & pressed': 'x' }`
5. **State keys never sit at the top level** of a styles object — `:hover`, `.active`, `[open]` belong inside a property value.

```jsx
color: { '': '#text', hovered: '#accent', disabled: '#text.40' }
```

Advanced states:

| Prefix | Use | Example |
|--------|-----|---------|
| `@media(…)` | media query; dimensions `w` `h`; types `@media:print` `:screen` `:all` `:speech` | `@media(w < 768px)`, `@media(600px <= w < 1200px)` |
| `@(…)` | container query; dimensions `w` `h` `is` `bs` | `@(layout, w >= 600px)`, `@($variant=primary)` |
| `@supports(…)` | feature query; `$` first argument tests a selector | `@supports(display: grid)`, `@supports($, :has(*))` |
| `@root(…)` | condition on `:root` | `@root(schema=dark)` |
| `@parent(…)` | condition on an ancestor; `, >` for the direct parent | `@parent(hovered, >)` |
| `@own(…)` | a sub-element's own state — **only inside sub-element styles** | `@own(:hover)` |
| `@starting` | `@starting-style` entry animation | `@starting` |
| `@name` | project state alias | `@mobile` |

- At root level write the selector directly: ❌ `'@own(:hover)'` → ✅ `':hover'`.
- `@name` aliases must exist in `states` in the config or be declared locally as an `'@name': '<state expression>'` key; alias keys start with `@` and their value must be a valid state expression.
- `:is()` / `:has()` / `:not()` / `:where()` work in state keys but support at most 2 levels of nested parentheses, and `:has()` is expensive — prefer `@parent()`, `@own()` and modifiers.

When extending a parent's state map: `'@inherit'` reuses the parent's value for that state, `null` removes a state (or resets a property, letting recipes fill in), `false` is a tombstone that blocks it entirely.

## 5. Sub-elements

A **capitalized** key targets `[data-element="Name"]`, and its value must be a style object.

```jsx
styles: { Title: { preset: 'h3' }, Icon: { $: '>@:last-child', color: '#accent' } }
```

❌ nested-selector keys (`'& .title'`, `'&:hover'`) → ✅ sub-elements and state maps. Use the `$` affix property inside a sub-element to control how its selector attaches (`>` direct child, `@` placeholder for the element itself, `&::before` for a root pseudo-element).

## 6. Special top-level keys

| Key | Shape |
|-----|-------|
| `@keyframes` | `{ name: { '0%': styles, … } }` |
| `@property` | `{ '$name': { syntax, inherits, initialValue } }` |
| `@font-face` | `{ 'Family Name': descriptors \| descriptors[] }` |
| `@counter-style` | `{ name: descriptors }` |
| `@function` | `{ '$$name': { args, returns?, result, '$local'? } }` |
| `recipe` | a **string** of configured recipe names: `'card elevated'`, `'reset input / autofill'`, `'none / disabled'` |

At-rule keys match the real CSS at-rule names, so they are kebab-case, not camelCase. Inside `@function`, the callable is `$$name` but its parameters and local variables are `$name`:

```jsx
styles: {
  '@function': { $$negative: { args: ['$value'], result: '(-1 * $value)' } },
  marginTop: '$$negative(2x)',
}
```

## 7. `tastyStatic()`

The selector must be a string literal and valid CSS. Values must be static — strings, numbers, booleans, `null`, or objects/arrays of those. No variables, template literals, function calls, or spreads.

## 8. Checklist

- Token, preset, recipe, unit and `@alias` names exist in the project config.
- Tasty shorthand chosen over CSS longhands; `flexGrow`/`flexShrink`/`flexBasis` over `flex`; `hide: true` over `display: 'none'`.
- Colors are `#tokens`, not hex/rgb/oklch/named; `$prop` not `var(--prop)`.
- Spacing uses `x`/`r`/`bw`/`ow` units; math uses `(…)`, not `calc(…)`.
- `true` only on the properties that accept it; no `!important`.
- Modifiers valid for the property; directional shorthand instead of placeholder zeros.
- Every state map starts with `''` (or `_`), is flat, and lives inside a property value.
- `@own()` only inside sub-elements; sub-element keys are capitalized and hold objects.
- At-rule keys are kebab-case (`@property`, `@font-face`, `@counter-style`, `@function`); `@function` names use `$$`, their args and locals use `$`.
- Values are static; dynamic behavior comes from `mods` / `tokens` / `styleProps`.
