import type { PropertyDefinition } from '../injector/types';

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
  // Default border color
  '#border': {
    inherits: true,
    initialValue: 'rgb(0 0 0)',
  },

  // ---- Core design tokens used by style handlers ----
  // These provide sensible defaults so Tasty works standalone without a design system.
  // Consuming projects (e.g. uikit) override these by defining tokens on :root.

  $gap: {
    syntax: '<length>',
    inherits: true,
    initialValue: '4px',
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
    initialValue: '80ms',
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
    initialValue: '700',
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
