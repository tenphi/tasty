/**
 * Tasty Configuration Module
 *
 * Centralizes all tasty configuration, including:
 * - Style injector settings (nonce, cleanup thresholds, etc.)
 * - Global predefined states for advanced state mapping
 * - stylesGenerated flag that locks configuration after first style generation
 *
 * Configuration must be done BEFORE any styles are generated.
 * After the first `inject()` call, configuration is locked and attempts to
 * reconfigure will emit a warning and be ignored.
 */

import { StyleInjector } from './injector/injector';
import { clearPipelineCache, isSelector, renderStyles } from './pipeline';
import { setGlobalPredefinedStates } from './states';
import {
  normalizeHandlerDefinition,
  registerHandler,
  resetHandlers,
} from './styles/predefined';
import { resetColorSpace, setColorSpace } from './utils/color-space';
import { isDevEnv } from './utils/is-dev-env';
import {
  CUSTOM_UNITS,
  getGlobalFuncs,
  getGlobalParser,
  normalizeColorTokenValue,
  resetGlobalPredefinedTokens,
  setGlobalPredefinedTokens,
} from './utils/styles';

import type { ColorSpace } from './utils/color-space';

import type {
  CounterStyleDescriptors,
  FontFaceInput,
  GCConfig,
  KeyframesSteps,
  PropertyDefinition,
} from './injector/types';
import type { StyleDetails, UnitHandler } from './parser/types';
import type { StyleResult } from './pipeline';
import type { TastyPlugin } from './plugins/types';
import type { RecipeStyles, ConfigTokens } from './styles/types';
import type { StyleHandlerDefinition } from './utils/styles';

/**
 * Configuration options for the Tasty style system
 */
export interface TastyConfig {
  /** CSP nonce for style elements */
  nonce?: string;
  /** Maximum rules per stylesheet (default: 8192) */
  maxRulesPerSheet?: number;
  /** Force text injection mode, auto-detected in test environments (default: auto) */
  forceTextInjection?: boolean;
  /** Enable development mode features: performance metrics and debug info (default: auto) */
  devMode?: boolean;
  /**
   * Global predefined states for advanced state mapping.
   * These are state aliases that can be used in any component.
   * Example: { '@mobile': '@media(w < 920px)', '@dark': '@root(theme=dark)' }
   */
  states?: Record<string, string>;
  /**
   * Parser LRU cache size (default: 1000).
   * Larger values improve performance for apps with many unique style values.
   */
  parserCacheSize?: number;
  /**
   * Custom units for the style parser (merged with built-in units).
   * Units transform numeric values like `2x` → `calc(2 * var(--gap))`.
   * @example { em: 'em', vw: 'vw', custom: (n) => `${n * 10}px` }
   */
  units?: Record<string, string | UnitHandler>;
  /**
   * Custom functions for the style parser (merged with existing).
   * Functions process parsed style groups and return CSS values.
   * @example { myFunc: (groups) => groups.map(g => g.output).join(' ') }
   */
  funcs?: Record<string, (groups: StyleDetails[]) => string>;
  /**
   * Color space used for decomposed color token companion variables.
   * Controls the CSS function and suffix for alpha composition.
   *
   * - `'rgb'`   — suffix `-rgb`, e.g. `rgb(var(--name-color-rgb) / .5)`
   * - `'hsl'`   — suffix `-hsl`, e.g. `hsl(var(--name-color-hsl) / .5)`
   * - `'oklch'` — suffix `-oklch`, e.g. `oklch(var(--name-color-oklch) / .5)`
   *
   * @default 'oklch'
   */
  colorSpace?: ColorSpace;
  /**
   * Automatically infer and register CSS @property declarations
   * from custom property values found in styles, keyframes, and global config.
   * Covers all types: \<color\>, \<number\>, \<length\>, \<angle\>, \<percentage\>, \<time\>.
   * When false, only explicitly declared @properties are registered.
   * @default true
   */
  autoPropertyTypes?: boolean;
  /**
   * Garbage collection configuration for unused styles.
   * GC is triggered by touch count: every `touchInterval` touches, the
   * oldest unused styles are evicted when their count exceeds `capacity`.
   * @example
   * ```ts
   * configure({
   *   gc: { touchInterval: 1000, capacity: 1000 },
   * });
   * ```
   */
  gc?: GCConfig;
  /**
   * Plugins that extend tasty with custom functions, units, or states.
   * Plugins are processed in order, with later plugins overriding earlier ones.
   * @example
   * ```ts
   * import { okhslPlugin } from '@tenphi/tasty';
   *
   * configure({
   *   plugins: [okhslPlugin()],
   * });
   * ```
   */
  plugins?: TastyPlugin[];
  /**
   * Global keyframes definitions that can be referenced by animation names in styles.
   * Keys are animation names, values are keyframes step definitions.
   * Keyframes are only injected when actually used in styles.
   * @example
   * ```ts
   * configure({
   *   keyframes: {
   *     fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
   *     pulse: { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
   *   },
   * });
   * ```
   */
  keyframes?: Record<string, KeyframesSteps>;
  /**
   * Global CSS @property definitions for custom properties.
   * Keys use tasty token syntax ($name for properties, #name for colors).
   *
   * Tasty ships with `DEFAULT_PROPERTIES` (e.g. `$gap`, `$radius`, `#white`,
   * `#black`, `#clear`, `#border`, etc.) that are always included.
   * Properties you specify here are merged on top, so you can override any
   * default by using the same key.
   *
   * For color tokens (#name), `syntax: '<color>'` is auto-set and
   * `initialValue` defaults to `'transparent'` if not specified.
   *
   * @example
   * ```ts
   * configure({
   *   properties: {
   *     '$rotation': { syntax: '<angle>', initialValue: '0deg' },
   *     '$scale': { syntax: '<number>', inherits: false, initialValue: 1 },
   *     '#accent': { initialValue: 'purple' }, // syntax: '<color>' auto-set
   *     // Override a default property:
   *     '$gap': { syntax: '<length>', inherits: true, initialValue: '8px' },
   *   },
   * });
   *
   * // Now use in styles - properties are registered when component renders:
   * const Spinner = tasty({
   *   styles: {
   *     transform: 'rotate($rotation)',
   *     transition: '$$rotation 0.3s', // outputs: --rotation 0.3s
   *   },
   * });
   * ```
   */
  properties?: Record<string, PropertyDefinition>;
  /**
   * Global @font-face definitions.
   * Keys are font-family names, values are descriptors or arrays of descriptors
   * (for multiple weights/styles of the same family).
   * Injected eagerly when styles are first generated.
   * @example
   * ```ts
   * configure({
   *   fontFace: {
   *     'Brand Sans': [
   *       { src: 'url("/fonts/brand-regular.woff2") format("woff2")', fontWeight: 400, fontDisplay: 'swap' },
   *       { src: 'url("/fonts/brand-bold.woff2") format("woff2")', fontWeight: 700, fontDisplay: 'swap' },
   *     ],
   *     Icons: { src: 'url("/fonts/icons.woff2") format("woff2")', fontDisplay: 'block' },
   *   },
   * });
   * ```
   */
  fontFace?: Record<string, FontFaceInput>;
  /**
   * Global @counter-style definitions.
   * Keys are counter-style names, values are descriptor objects.
   * Injected eagerly when styles are first generated.
   * @example
   * ```ts
   * configure({
   *   counterStyle: {
   *     thumbs: { system: 'cyclic', symbols: '"👍"', suffix: '" "' },
   *   },
   * });
   * ```
   */
  counterStyle?: Record<string, CounterStyleDescriptors>;
  /**
   * Custom style handlers that transform style properties into CSS declarations.
   * Handlers replace built-in handlers for the same style name.
   * @example
   * ```ts
   * import { styleHandlers } from '@tenphi/tasty';
   *
   * configure({
   *   handlers: {
   *     // Override fill with custom behavior
   *     fill: ({ fill }) => {
   *       if (fill?.startsWith('gradient:')) {
   *         return { background: fill.slice(9) };
   *       }
   *       return styleHandlers.fill({ fill });
   *     },
   *     // Add new custom style
   *     elevation: ({ elevation }) => {
   *       const level = parseInt(elevation) || 1;
   *       return {
   *         'box-shadow': `0 ${level * 2}px ${level * 4}px rgba(0,0,0,0.1)`,
   *         'z-index': String(level * 100),
   *       };
   *     },
   *   },
   * });
   * ```
   */
  handlers?: Record<string, StyleHandlerDefinition>;
  /**
   * Design tokens injected as CSS custom properties on `:root`.
   * Values are parsed through the Tasty DSL. Supports state maps
   * for responsive/theme-aware tokens.
   *
   * - `$name` keys become `--name` CSS custom properties
   * - `#name` keys become `--name-color` and `--name-color-{colorSpace}` properties
   *
   * Tokens are injected once when the first style is rendered.
   *
   * @example
   * ```ts
   * configure({
   *   tokens: {
   *     '$gap': '4px',
   *     '#primary': {
   *       '': '#purple',
   *       '@dark': '#light-purple',
   *     },
   *   },
   * });
   * ```
   */
  tokens?: ConfigTokens;
  /**
   * Predefined tokens that are replaced during style parsing (parse-time substitution).
   * Use `$name` for custom properties and `#name` for color tokens.
   * Values are substituted inline before CSS generation, unlike `tokens` which
   * inject CSS custom properties on `:root`.
   *
   * For color tokens (#name), boolean `true` is converted to `transparent`.
   *
   * @example
   * ```ts
   * configure({
   *   replaceTokens: {
   *     $spacing: '2x',
   *     '#accent': '#purple',
   *     '#overlay': true, // → transparent
   *   },
   * });
   *
   * // Now use in styles - tokens are replaced at parse time:
   * const Card = tasty({
   *   styles: {
   *     padding: '$spacing',  // → calc(2 * var(--gap))
   *     fill: '#accent',      // → var(--purple-color)
   *   },
   * });
   * ```
   */
  replaceTokens?: Record<`$${string}`, string | number | boolean> &
    Record<`#${string}`, string | number | boolean>;
  /**
   * Predefined style recipes -- named style bundles that can be applied via `recipe` style property.
   * Recipe values are flat tasty styles (no sub-element keys). They may contain base styles,
   * tokens (`$name`/`#name` definitions), local states, `@keyframes`, and `@properties`.
   *
   * Components reference recipes via: `recipe: 'name1 name2'` in their styles.
   * Use `/` to separate base recipes from post recipes: `recipe: 'base1 base2 / post1'`.
   * Use `none` to skip base recipes: `recipe: 'none / post1'`.
   * Resolution order: `base_recipes → component styles → post_recipes`.
   *
   * Recipes cannot reference other recipes.
   *
   * @example
   * ```ts
   * configure({
   *   recipes: {
   *     card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
   *     elevated: { shadow: '2x 2x 4x #shadow' },
   *   },
   * });
   *
   * // Usage in styles:
   * const Card = tasty({
   *   styles: {
   *     recipe: 'card elevated',
   *     color: '#text', // Overrides recipe values
   *   },
   * });
   * ```
   */
  recipes?: Record<string, RecipeStyles>;
}

// Warnings tracking to avoid duplicates
const emittedWarnings = new Set<string>();

const devMode = isDevEnv();

/**
 * Emit a warning only once
 */
function warnOnce(key: string, message: string): void {
  if (devMode && !emittedWarnings.has(key)) {
    emittedWarnings.add(key);
    console.warn(message);
  }
}

// ============================================================================
// Configuration State
// ============================================================================

// Track whether styles have been generated (locks configuration)
let stylesGenerated = false;

// Current configuration (null until first configure() or auto-configured on first use)
let currentConfig: TastyConfig | null = null;

// Global keyframes storage (null = no keyframes configured, empty object checked via hasGlobalKeyframes)
let globalKeyframes: Record<string, KeyframesSteps> | null = null;

// Global font-face storage (null = no font faces configured)
let globalFontFace: Record<string, FontFaceInput> | null = null;

// Global counter-style storage (null = no counter styles configured)
let globalCounterStyle: Record<string, CounterStyleDescriptors> | null = null;

// Global properties storage (null = no properties configured)
let globalProperties: Record<string, PropertyDefinition> | null = null;

// Global recipes storage (null = no recipes configured)
let globalRecipes: Record<string, RecipeStyles> | null = null;

// Global token styles storage (injected as :root CSS custom properties)
let globalConfigTokens: ConfigTokens | null = null;

/**
 * Default properties shipped with tasty.
 * These are always included unless explicitly overridden via `configure({ properties })`.
 * Keys use tasty token syntax (#name for colors, $name for other properties).
 *
 * For properties with CSS @property-compatible types (length, time, number, color),
 * an `initialValue` is provided so the property works even without a project-level token.
 */
export const DEFAULT_PROPERTIES: Record<string, PropertyDefinition> = {
  // Used by dual-fill feature to enable CSS transitions on the second fill color
  '#tasty-second-fill': {
    inherits: false,
    initialValue: 'transparent',
  },
  // Current color context variable (set by the color style handler).
  '#current': {
    inherits: true,
    initialValue: 'transparent',
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
  // These provide sensible defaults so tasty works standalone without a design system.
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

// Global injector instance key
const GLOBAL_INJECTOR_KEY = '__TASTY_GLOBAL_INJECTOR__';

interface TastyGlobalStorage {
  [GLOBAL_INJECTOR_KEY]?: StyleInjector;
}

declare global {
  interface Window {
    [GLOBAL_INJECTOR_KEY]?: StyleInjector;
  }

  var __TASTY_GLOBAL_INJECTOR__: StyleInjector | undefined;
}

/**
 * Detect if we're running in a test environment
 */
export function isTestEnvironment(): boolean {
  // Check Node.js environment
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return true;
  }

  // Check for test runner globals (safely)
  if (typeof global !== 'undefined') {
    const g = global as unknown as Record<string, unknown>;
    if (g.vi || g.jest || g.expect || g.describe || g.it) {
      return true;
    }
  }

  // Check for jsdom environment (common in tests)
  if (
    typeof window !== 'undefined' &&
    window.navigator?.userAgent?.includes('jsdom')
  ) {
    return true;
  }

  // Check for other test runners
  if (typeof globalThis !== 'undefined') {
    const gt = globalThis as unknown as Record<string, unknown>;
    if (gt.vitest || gt.mocha) {
      return true;
    }
  }

  return false;
}

/**
 * Create default configuration with optional test environment detection
 */
function createDefaultConfig(isTest?: boolean): TastyConfig {
  return {
    maxRulesPerSheet: 8192,
    forceTextInjection: isTest ?? false,
    devMode: isDevEnv(),
  };
}

// ============================================================================
// stylesGenerated Flag Management
// ============================================================================

/**
 * Mark that styles have been generated (called by injector on first inject)
 * This locks the configuration - no further changes allowed.
 * Also injects internal and global properties.
 */
export function markStylesGenerated(): void {
  if (stylesGenerated) return; // Already marked, skip

  stylesGenerated = true;

  const injector = getGlobalInjector();

  // Inject all properties (defaults merged with user-configured overrides)
  for (const [token, definition] of Object.entries(getEffectiveProperties())) {
    injector.property(token, definition);
  }

  // Inject global @font-face rules (eagerly — fonts should be available before render)
  if (globalFontFace && Object.keys(globalFontFace).length > 0) {
    for (const [family, input] of Object.entries(globalFontFace)) {
      const descriptors = Array.isArray(input) ? input : [input];
      for (const desc of descriptors) {
        injector.fontFace(family, desc);
      }
    }
  }

  // Inject global @counter-style rules (eagerly)
  if (globalCounterStyle && Object.keys(globalCounterStyle).length > 0) {
    for (const [name, descriptors] of Object.entries(globalCounterStyle)) {
      injector.counterStyle(name, descriptors);
    }
  }

  // Inject configured tokens as :root CSS custom properties
  if (globalConfigTokens && Object.keys(globalConfigTokens).length > 0) {
    const tokenRules = renderStyles(
      globalConfigTokens,
      ':root',
    ) as StyleResult[];
    if (tokenRules.length > 0) {
      injector.injectGlobal(tokenRules);
    }
  }
}

/**
 * Check if styles have been generated (configuration is locked)
 */
export function hasStylesGenerated(): boolean {
  return stylesGenerated;
}

/**
 * Reset styles generated flag (for testing only)
 */
export function resetStylesGenerated(): void {
  stylesGenerated = false;
  emittedWarnings.clear();
}

// ============================================================================
// Global Keyframes Management
// ============================================================================

let _hasGlobalKeyframes = false;

/**
 * Check if any global keyframes are configured.
 * Uses a pre-computed flag to avoid Object.keys() allocation on every call.
 */
export function hasGlobalKeyframes(): boolean {
  return _hasGlobalKeyframes;
}

/**
 * Get global keyframes configuration.
 * Returns null if no keyframes configured (fast path for zero-overhead).
 */
export function getGlobalKeyframes(): Record<string, KeyframesSteps> | null {
  return globalKeyframes;
}

/**
 * Set global keyframes (called from configure).
 * Internal use only.
 */
function setGlobalKeyframes(keyframes: Record<string, KeyframesSteps>): void {
  if (stylesGenerated) {
    warnOnce(
      'keyframes-after-styles',
      `[Tasty] Cannot update keyframes after styles have been generated.\n` +
        `The new keyframes will be ignored.`,
    );
    return;
  }
  globalKeyframes = keyframes;
  _hasGlobalKeyframes = Object.keys(keyframes).length > 0;
}

// ============================================================================
// Global Properties Management
// ============================================================================

/**
 * Check if any global properties are configured.
 * Fast path: returns false if no properties were ever set.
 */
export function hasGlobalProperties(): boolean {
  return globalProperties !== null && Object.keys(globalProperties).length > 0;
}

/**
 * Get global properties configuration.
 * Returns null if no properties configured (fast path for zero-overhead).
 */
export function getGlobalProperties(): Record<
  string,
  PropertyDefinition
> | null {
  return globalProperties;
}

/**
 * Set global properties (called from configure).
 * Internal use only.
 */
function setGlobalProperties(
  properties: Record<string, PropertyDefinition>,
): void {
  if (stylesGenerated) {
    warnOnce(
      'properties-after-styles',
      `[Tasty] Cannot update properties after styles have been generated.\n` +
        `The new properties will be ignored.`,
    );
    return;
  }
  globalProperties = properties;
}

/**
 * Get the effective properties: DEFAULT_PROPERTIES merged with user-configured
 * properties. User properties override defaults with matching keys.
 */
export function getEffectiveProperties(): Record<string, PropertyDefinition> {
  if (!globalProperties) return DEFAULT_PROPERTIES;
  return { ...DEFAULT_PROPERTIES, ...globalProperties };
}

// ============================================================================
// Global Font Face Management
// ============================================================================

/**
 * Get global font-face configuration.
 * Returns null if no font faces configured.
 */
export function getGlobalFontFace(): Record<string, FontFaceInput> | null {
  return globalFontFace;
}

/**
 * Set global font faces (called from configure).
 * Internal use only.
 */
function setGlobalFontFace(fontFace: Record<string, FontFaceInput>): void {
  if (stylesGenerated) {
    warnOnce(
      'fontface-after-styles',
      `[Tasty] Cannot update fontFace after styles have been generated.\n` +
        `The new font faces will be ignored.`,
    );
    return;
  }
  globalFontFace = fontFace;
}

// ============================================================================
// Global Counter Style Management
// ============================================================================

/**
 * Get global counter-style configuration.
 * Returns null if no counter styles configured.
 */
export function getGlobalCounterStyle(): Record<
  string,
  CounterStyleDescriptors
> | null {
  return globalCounterStyle;
}

/**
 * Set global counter styles (called from configure).
 * Internal use only.
 */
function setGlobalCounterStyle(
  counterStyle: Record<string, CounterStyleDescriptors>,
): void {
  if (stylesGenerated) {
    warnOnce(
      'counterstyle-after-styles',
      `[Tasty] Cannot update counterStyle after styles have been generated.\n` +
        `The new counter styles will be ignored.`,
    );
    return;
  }
  globalCounterStyle = counterStyle;
}

// ============================================================================
// Global Recipes Management
// ============================================================================

/**
 * Check if any global recipes are configured.
 * Fast path: returns false if no recipes were ever set.
 */
export function hasGlobalRecipes(): boolean {
  return globalRecipes !== null && Object.keys(globalRecipes).length > 0;
}

/**
 * Get global recipes configuration.
 * Returns null if no recipes configured (fast path for zero-overhead).
 */
export function getGlobalRecipes(): Record<string, RecipeStyles> | null {
  return globalRecipes;
}

/**
 * Set global recipes (called from configure).
 * Internal use only.
 */
function setGlobalRecipes(recipes: Record<string, RecipeStyles>): void {
  if (stylesGenerated) {
    warnOnce(
      'recipes-after-styles',
      `[Tasty] Cannot update recipes after styles have been generated.\n` +
        `The new recipes will be ignored.`,
    );
    return;
  }

  // Dev-mode validation
  if (devMode) {
    for (const [name, recipeStyles] of Object.entries(recipes)) {
      if (name === 'none') {
        warnOnce(
          'recipe-reserved-none',
          `[Tasty] Recipe name "none" is reserved. ` +
            `It is used as a keyword meaning "no base recipes" ` +
            `(e.g. recipe: 'none / post-recipe'). ` +
            `Choose a different name for your recipe.`,
        );
      }

      for (const key of Object.keys(recipeStyles)) {
        if (isSelector(key)) {
          warnOnce(
            `recipe-selector-${name}-${key}`,
            `[Tasty] Recipe "${name}" contains sub-element key "${key}". ` +
              `Recipes must be flat styles without sub-element keys. ` +
              `Remove the sub-element key from the recipe definition.`,
          );
        }
        if (key === 'recipe') {
          warnOnce(
            `recipe-recursive-${name}`,
            `[Tasty] Recipe "${name}" contains a "recipe" key. ` +
              `Recipes cannot reference other recipes. ` +
              `Use space-separated names for composition: recipe: 'base elevated'.`,
          );
        }
      }
    }
  }

  globalRecipes = recipes;
}

// ============================================================================
// Global Token Styles Management
// ============================================================================

/**
 * Get global token styles for :root injection.
 * Returns null if no tokens configured.
 */
export function getGlobalConfigTokens(): ConfigTokens | null {
  return globalConfigTokens;
}

/**
 * Set global token styles (called from configure).
 * Internal use only.
 */
function setGlobalConfigTokens(styles: ConfigTokens): void {
  if (stylesGenerated) {
    warnOnce(
      'tokens-after-styles',
      `[Tasty] Cannot update tokens after styles have been generated.\n` +
        `The new tokens will be ignored.`,
    );
    return;
  }
  globalConfigTokens = globalConfigTokens
    ? { ...globalConfigTokens, ...styles }
    : styles;
}

/**
 * Check if configuration is locked (styles have been generated)
 */
export function isConfigLocked(): boolean {
  return stylesGenerated;
}

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Configure the Tasty style system.
 *
 * Must be called BEFORE any styles are generated (before first render that uses tasty).
 * After styles are generated, configuration is locked and calls to configure() will
 * emit a warning and be ignored.
 *
 * @example
 * ```ts
 * import { configure } from '@tenphi/tasty';
 *
 * // Configure before app renders
 * configure({
 *   nonce: 'abc123',
 *   states: {
 *     '@mobile': '@media(w < 768px)',
 *     '@dark': '@root(theme=dark)',
 *   },
 * });
 * ```
 */
export function configure(config: Partial<TastyConfig> = {}): void {
  if (stylesGenerated) {
    warnOnce(
      'configure-after-styles',
      `[Tasty] Cannot call configure() after styles have been generated.\n` +
        `Configuration must be done before the first render. The configuration will be ignored.`,
    );
    return;
  }

  // Collect merged values from plugins first, then override with direct config
  let mergedStates: Record<string, string> = {};
  let mergedUnits: Record<string, string | UnitHandler> = {};
  let mergedFuncs: Record<string, (groups: StyleDetails[]) => string> = {};
  let mergedHandlers: Record<string, StyleHandlerDefinition> = {};
  let mergedReplaceTokens: Record<string, string | number | boolean> = {};
  let mergedConfigTokens: ConfigTokens = {} as ConfigTokens;
  let mergedRecipes: Record<string, RecipeStyles> = {};

  // Process plugins in order
  if (config.plugins) {
    for (const plugin of config.plugins) {
      if (plugin.states) {
        mergedStates = { ...mergedStates, ...plugin.states };
      }
      if (plugin.units) {
        mergedUnits = { ...mergedUnits, ...plugin.units };
      }
      if (plugin.funcs) {
        mergedFuncs = { ...mergedFuncs, ...plugin.funcs };
      }
      if (plugin.handlers) {
        mergedHandlers = { ...mergedHandlers, ...plugin.handlers };
      }
      if (plugin.replaceTokens) {
        mergedReplaceTokens = {
          ...mergedReplaceTokens,
          ...plugin.replaceTokens,
        };
      }
      if (plugin.tokens) {
        mergedConfigTokens = { ...mergedConfigTokens, ...plugin.tokens };
      }
      if (plugin.recipes) {
        mergedRecipes = { ...mergedRecipes, ...plugin.recipes };
      }
    }
  }

  // Direct config overrides plugins
  if (config.states) {
    mergedStates = { ...mergedStates, ...config.states };
  }
  if (config.units) {
    mergedUnits = { ...mergedUnits, ...config.units };
  }
  if (config.funcs) {
    mergedFuncs = { ...mergedFuncs, ...config.funcs };
  }
  if (config.handlers) {
    mergedHandlers = { ...mergedHandlers, ...config.handlers };
  }
  if (config.replaceTokens) {
    mergedReplaceTokens = { ...mergedReplaceTokens, ...config.replaceTokens };
  }
  if (config.tokens) {
    mergedConfigTokens = { ...mergedConfigTokens, ...config.tokens };
  }
  if (config.recipes) {
    mergedRecipes = { ...mergedRecipes, ...config.recipes };
  }

  // Warn on tokens/replaceTokens key conflicts
  if (devMode) {
    const tokenKeys = new Set(Object.keys(mergedConfigTokens));
    for (const key of Object.keys(mergedReplaceTokens)) {
      if (tokenKeys.has(key)) {
        warnOnce(
          `token-conflict-${key}`,
          `[Tasty] Token "${key}" is defined in both \`tokens\` and \`replaceTokens\`. ` +
            `\`replaceTokens\` performs parse-time substitution, so the \`tokens\` ` +
            `CSS custom property will be injected but never used by Tasty styles. ` +
            `Remove it from one of the two.`,
        );
      }
    }
  }

  // Handle color space (must be set before any token processing)
  if (config.colorSpace) {
    setColorSpace(config.colorSpace);
    // Color space affects parser output (e.g. #name.5 → oklch(...) vs rgb(...))
    getGlobalParser().clearCache();
  }

  // Handle predefined states
  if (Object.keys(mergedStates).length > 0) {
    setGlobalPredefinedStates(mergedStates);
  }

  // Handle parser configuration (merge semantics - extend, not replace)
  const parser = getGlobalParser();

  if (config.parserCacheSize !== undefined) {
    parser.updateOptions({ cacheSize: config.parserCacheSize });
  }

  if (Object.keys(mergedUnits).length > 0) {
    // Merge with existing units
    const currentUnits = parser.getUnits() ?? CUSTOM_UNITS;
    parser.setUnits({ ...currentUnits, ...mergedUnits });
  }

  if (Object.keys(mergedFuncs).length > 0) {
    // Merge with existing funcs
    const currentFuncs = getGlobalFuncs();
    const finalFuncs = { ...currentFuncs, ...mergedFuncs };
    parser.setFuncs(finalFuncs);
    // Also update the global registry so customFunc() continues to work
    Object.assign(currentFuncs, mergedFuncs);
  }

  // Handle keyframes
  if (config.keyframes) {
    setGlobalKeyframes(config.keyframes);
  }

  // Handle properties
  if (config.properties) {
    setGlobalProperties(config.properties);
  }

  // Handle font faces
  if (config.fontFace) {
    setGlobalFontFace(config.fontFace);
  }

  // Handle counter styles
  if (config.counterStyle) {
    setGlobalCounterStyle(config.counterStyle);
  }

  // Handle custom handlers
  if (Object.keys(mergedHandlers).length > 0) {
    for (const [name, definition] of Object.entries(mergedHandlers)) {
      const handler = normalizeHandlerDefinition(name, definition);
      registerHandler(handler);
    }
  }

  // Handle replaceTokens (parse-time substitution)
  if (Object.keys(mergedReplaceTokens).length > 0) {
    const processedTokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(mergedReplaceTokens)) {
      if (key.startsWith('#')) {
        const normalized = normalizeColorTokenValue(value);
        if (normalized === null) continue;
        processedTokens[key] = String(normalized);
      } else if (value === false) {
        continue;
      } else {
        processedTokens[key] = String(value);
      }
    }
    setGlobalPredefinedTokens(processedTokens);
  }

  // Handle tokens (CSS custom properties on :root)
  if (Object.keys(mergedConfigTokens).length > 0) {
    setGlobalConfigTokens(mergedConfigTokens);
  }

  // Handle recipes
  if (Object.keys(mergedRecipes).length > 0) {
    setGlobalRecipes(mergedRecipes);
  }

  const {
    states: _states,
    parserCacheSize: _parserCacheSize,
    units: _units,
    funcs: _funcs,
    plugins: _plugins,
    keyframes: _keyframes,
    properties: _properties,
    fontFace: _fontFace,
    counterStyle: _counterStyle,
    handlers: _handlers,
    tokens: _tokens,
    replaceTokens: _replaceTokens,
    recipes: _recipes,
    colorSpace: _colorSpace,
    ...injectorConfig
  } = config;

  const fullConfig: TastyConfig = {
    ...createDefaultConfig(),
    ...currentConfig,
    ...injectorConfig,
  };

  // Store the config
  currentConfig = fullConfig;

  // Create/replace the global injector
  const storage: TastyGlobalStorage =
    typeof window !== 'undefined' ? window : globalThis;
  storage[GLOBAL_INJECTOR_KEY] = new StyleInjector(fullConfig);
}

/**
 * Get the current configuration.
 * If not configured, returns default configuration.
 */
export function getConfig(): TastyConfig {
  if (!currentConfig) {
    currentConfig = createDefaultConfig(isTestEnvironment());
  }
  return currentConfig;
}

/**
 * Get the global injector instance.
 * Auto-configures with defaults if not already configured.
 */
export function getGlobalInjector(): StyleInjector {
  const storage: TastyGlobalStorage =
    typeof window !== 'undefined' ? window : globalThis;

  if (!storage[GLOBAL_INJECTOR_KEY]) {
    configure();
  }

  return storage[GLOBAL_INJECTOR_KEY]!;
}

/**
 * Reset configuration (for testing only).
 * Clears the global injector and allows reconfiguration.
 */
export function resetConfig(): void {
  stylesGenerated = false;
  currentConfig = null;
  globalKeyframes = null;
  _hasGlobalKeyframes = false;
  globalProperties = null;
  globalFontFace = null;
  globalCounterStyle = null;
  globalRecipes = null;
  globalConfigTokens = null;
  resetGlobalPredefinedTokens();
  resetHandlers();
  resetColorSpace();
  clearPipelineCache();
  emittedWarnings.clear();

  const storage: TastyGlobalStorage =
    typeof window !== 'undefined' ? window : globalThis;
  delete storage[GLOBAL_INJECTOR_KEY];
}

// Re-export TastyConfig as StyleInjectorConfig for backward compatibility
export type { TastyConfig as StyleInjectorConfig };
