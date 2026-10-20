import type { PropertyDefinition } from '../injector/types';

// Defaults the style handlers also inline as `var()` fallbacks, so their output
// keeps its meaning where this set is not emitted (zero-runtime CSS).
export const DEFAULT_TRANSITION = '80ms';
export const DEFAULT_BOLD_FONT_WEIGHT = '700';

/**
 * Default properties shipped with Tasty.
 *
 * Kept with the property formatter so runtime and build-time configuration
 * paths can share the same list without importing the browser runtime.
 */
export const DEFAULT_PROPERTIES: Record<string, PropertyDefinition> = {
  // Used by dual-fill feature to enable CSS transitions on the second fill color
  '#tasty-second-fill': {
    inherits: false,
    initialValue: 'transparent',
  },
  // The inherited color, published by the `color` handler for anything that
  // wants it as a color rather than as the `currentcolor` keyword. (`#current`
  // itself compiles to the keyword.) `initial-value: currentcolor` makes it a
  // true stand-in where nothing published it: a registered `<color>` property
  // keeps the keyword as its computed value and resolves it against each
  // element's own color. `transparent` here would render a reader invisible.
  '#current': {
    inherits: true,
    initialValue: 'currentcolor',
  },
  // White and black are fundamental colors that need explicit initial values.
  '#white': {
    inherits: true,
    initialValue: 'rgb(255 255 255)',
  },
  '#black': {
    inherits: true,
    initialValue: 'rgb(0 0 0)',
  },
  // Shorthand for transparent
  '#clear': {
    inherits: true,
    initialValue: 'transparent',
  },
  // Default border color: the text color, as in plain CSS. It matches the
  // `border` handler's `var(--border-color, currentColor)` fallback, which
  // zero-runtime CSS relies on, so a border with no color looks the same in
  // every rendering mode.
  '#border': {
    inherits: true,
    initialValue: 'currentcolor',
  },

  // ---- Core design tokens ----
  // These provide sensible defaults so Tasty works standalone without a design system.
  // Consuming projects (e.g. uikit) override these by defining tokens on :root.
  // Each matches its built-in unit (`x`, `r`, `bw`, `ow`), so pointing the unit
  // at the token (`units: { x: 'var(--gap)' }`) keeps the default scale.

  $gap: {
    syntax: '<length>',
    inherits: true,
    initialValue: '8px',
  },
  $radius: {
    syntax: '<length>',
    inherits: true,
    initialValue: '6px',
  },
  '$border-width': {
    syntax: '<length>',
    inherits: true,
    initialValue: '1px',
  },
  '$outline-width': {
    syntax: '<length>',
    inherits: true,
    initialValue: '3px',
  },
  $transition: {
    syntax: '<time>',
    inherits: true,
    initialValue: DEFAULT_TRANSITION,
  },
  // Used by radius.ts for `radius="leaf"` modifier
  '$sharp-radius': {
    syntax: '<length>',
    inherits: true,
    initialValue: '0px',
  },
  // Used by preset.ts for `preset="name / strong"`
  '$bold-font-weight': {
    syntax: '<number>',
    inherits: true,
    initialValue: DEFAULT_BOLD_FONT_WEIGHT,
  },
  // Used by preset.ts as fallback font stacks
  '$font-sans-fallback': {
    syntax: '*',
    inherits: true,
    initialValue:
      'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
  },
  '$font-mono-fallback': {
    syntax: '*',
    inherits: true,
    initialValue:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
};
