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

import { resetFunctionPolyfills } from './functions';
import { applyStyleConfig, normalizeConfig } from './config-normalize';
import {
  getEffectiveProperties,
  getGlobalConfigTokens,
  getGlobalCounterStyles,
  getGlobalFontFaces,
  getGlobalFunctions,
  getGlobalStyles,
  mergeGlobalConfigTokens,
  mergeGlobalCounterStyles,
  mergeGlobalFontFaces,
  mergeGlobalFunctions,
  mergeGlobalProperties,
  mergeGlobalStyles,
  resetConfigResources,
  setRuntimeConfigState,
} from './config-resources';
import {
  hasStylesGenerated,
  isFunctionsPolyfillEnabled,
  markStylesGeneratedState,
  resetGlobalPolyfillsState,
  resetStylesGeneratedState,
} from './config-state';
import { resetStyleChunks } from './chunks/style-chunk-map';
import type { PropHandlerDefinition } from './prop-handlers';
import { registerPropHandler, resetPropHandlers } from './prop-handlers';
import { StyleInjector } from './injector/injector';
import { clearPipelineCache, renderStyles } from './pipeline';
import { resetHandlers } from './styles/predefined';
import {
  registerBaseStyleProps,
  resetBaseStyleProps,
} from './styles/base-props';
import { isDevEnv } from './utils/is-dev-env';
import { isSelector } from './utils/is-selector';
import { DEFAULT_NAME_PREFIX, validateNamePrefix } from './utils/name-prefix';
import { resetStyleWarnings } from './utils/warnings';
import {
  resetGlobalParseFunctions,
  resetGlobalPredefinedTokens,
} from './utils/styles';

import type { FunctionsConfig } from './functions';
import type { ColorSpace } from './utils/color-space';

import type {
  CounterStyleDescriptors,
  FontFaceInput,
  FunctionDefinition,
  GCConfig,
  KeyframesSteps,
  PropertyDefinition,
} from './injector/types';
import type { UnitHandler } from './parser/types';
import type { StyleResult } from './pipeline';
import type { TastyPlugin } from './plugins/types';
import type { RecipeStyles, ConfigTokens } from './styles/types';
import type { Styles } from './styles/types';
import type { StyleHandlerDefinition } from './utils/styles';
import type { TypographyPreset } from './utils/typography';

export {
  getEffectiveProperties,
  getGlobalConfigTokens,
  getGlobalCounterStyles,
  getGlobalFontFaces,
  getGlobalFunctions,
  getGlobalStyles,
};

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
   * Custom functions (merged with existing). A single map holds both flavors,
   * discriminated by value type:
   *
   * - **Bare key + function value** — a parse-time function that processes the
   *   parsed argument groups and returns a CSS value. Called as `name(...)`.
   * - **`$$name` key + object value** — a declarative CSS `@function`
   *   definition. Called as `$$name(...)` (→ native `--name(...)`).
   *
   * A key whose prefix does not match its value type (object under a bare key,
   * or function under a `$$` key) is ignored with a dev warning.
   *
   * @example
   * ```ts
   * configure({
   *   functions: {
   *     double: (groups) => `calc(2 * ${groups[0].output})`, // parse function
   *     $$negative: { args: ['$value'], result: '(-1 * $value)' }, // CSS function
   *   },
   * });
   * ```
   */
  functions?: FunctionsConfig;
  /**
   * @deprecated No longer has any effect; will be removed in the next major.
   * Setting it warns in development.
   *
   * A `#name` token's value used to be rewritten into this color space so an
   * opacity suffix had numeric channels to write an alpha into. Opacity now uses
   * relative color syntax — `oklch(from var(--name-color) l c h / .5)` — which
   * has the browser read the channels, so a color is emitted exactly as
   * authored and there is nothing left for the setting to decide.
   *
   * To address a token's channels yourself, write relative color syntax against
   * the token: `oklch(from var(--brand-color) calc(l * 1.2) c h)`. It works on
   * every `<color>`, including the ones no conversion could evaluate.
   */
  colorSpace?: ColorSpace;
  /**
   * Automatically infer and register CSS @property declarations
   * from custom property values found in styles, keyframes, and global config.
   * Covers all types: \<color\>, \<number\>, \<length\>, \<angle\>, \<percentage\>, \<time\>.
   * When false, only explicitly declared @property are registered.
   * @default true
   */
  autoPropertyTypes?: boolean;
  /**
   * Defer stylesheet writes and apply them in one batch instead of performing
   * one `insertRule()` per component during render.
   *
   * Each `insertRule()` on a live sheet invalidates style for that sheet's
   * scope. When components inject during React's render phase while other
   * components read layout in the same pass, the two interleave and the browser
   * is forced to recalculate style between every injection. Batching collapses
   * that into one invalidation per flush.
   *
   * - `false` (default) — inject synchronously, one write per component.
   * - `true` — batch, but only inside a *batch window*: a commit in which
   *   `<TastyBatchProvider>` rendered and will therefore flush in its
   *   `useInsertionEffect`, before any `useLayoutEffect` runs. Any injection
   *   outside a window — a deep update the provider did not re-render for, an
   *   injection from a layout effect, an event handler, an async callback — is
   *   written straight through. Enabling this can never make a layout effect
   *   measure an unstyled element. Requires `<TastyBatchProvider>`; without it
   *   nothing is batched (and dev mode says so once).
   * - `'always'` — batch every injection, flushing on a microtask when no
   *   window is open. Wins on more commits, but a `useLayoutEffect` that
   *   measures a freshly mounted element can read its unstyled box, because
   *   microtasks run after the layout phase. Paint is unaffected: microtasks
   *   always drain before the browser paints.
   *
   * No effect during SSR or RSC: styles are collected as text there, the
   * runtime injector never runs, and the provider is inert without a
   * `document`. No effect on zero-runtime `tastyStatic` styles either — those
   * are extracted at build time and never reach the injector.
   *
   * @default false
   * @example
   * ```tsx
   * configure({ batchInjection: true });
   *
   * <TastyBatchProvider>
   *   <App />
   * </TastyBatchProvider>
   * ```
   */
  batchInjection?: boolean | 'always';
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
   * Prefix prepended to every generated identifier (class names,
   * keyframe names, counter-style names). The hash is appended verbatim,
   * so include any separator inside the prefix itself (e.g. `'myapp-'`).
   *
   * Discriminator letters are inserted between the prefix and the hash
   * for non-class names so the three kinds stay visually distinct:
   * - class:         `${namePrefix}${hash}`        — e.g. `t1a2b3`
   * - keyframe:      `${namePrefix}k${hash}`       — e.g. `tk1a2b3`
   * - counter-style: `${namePrefix}c${hash}`       — e.g. `tc1a2b3`
   *
   * The runtime, SSR, and RSC paths must agree on this value or
   * hydration will mismatch. The zero-runtime build path defaults to
   * `'ts'` (overridable via the same option) so its classes can't
   * collide with runtime classes when both are loaded on the same page.
   *
   * Must match `^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$`. Locked once styles
   * have been generated.
   *
   * @default 't'
   */
  namePrefix?: string;
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
   *   fontFaces: {
   *     'Brand Sans': [
   *       { src: 'url("/fonts/brand-regular.woff2") format("woff2")', fontWeight: 400, fontDisplay: 'swap' },
   *       { src: 'url("/fonts/brand-bold.woff2") format("woff2")', fontWeight: 700, fontDisplay: 'swap' },
   *     ],
   *     Icons: { src: 'url("/fonts/icons.woff2") format("woff2")', fontDisplay: 'block' },
   *   },
   * });
   * ```
   */
  fontFaces?: Record<string, FontFaceInput>;
  /**
   * Global @counter-style definitions.
   * Keys are counter-style names, values are descriptor objects.
   * Injected eagerly when styles are first generated.
   * @example
   * ```ts
   * configure({
   *   counterStyles: {
   *     thumbs: { system: 'cyclic', symbols: '"👍"', suffix: '" "' },
   *   },
   * });
   * ```
   */
  counterStyles?: Record<string, CounterStyleDescriptors>;
  /**
   * Opt-in polyfills for not-yet-baseline CSS features. Each key toggles a
   * feature polyfill; all default to `false`.
   *
   * - `functions` — polyfill CSS `@function` by inlining every `$$name(...)`
   *   call into plain CSS (calc/var/color-mix) at parse time instead of
   *   emitting the native `@function` at-rule. Enables `@function` usage in
   *   browsers that don't support it yet (Firefox/Safari). Note this is the
   *   `functions` *feature toggle*, distinct from the top-level `functions`
   *   definitions map.
   *
   * @example
   * ```ts
   * configure({ polyfills: { functions: true } });
   * ```
   */
  polyfills?: { functions?: boolean };
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
   * Props middleware for every tasty component. A prop handler receives the
   * component's props and returns them, changed or not — the extension point for
   * props that are not style properties.
   *
   * The map key is the handler's name and, by default, the prop that triggers it.
   * Use `['*', fn]` for an unconditional handler, or `[['a', 'b'], fn]` to trigger
   * on any of several props.
   *
   * Handlers must be pure and must not mutate their input: style values are cached
   * by object identity, so mutating one in place yields stale CSS. Memoize the
   * styles you build per input value.
   *
   * Not applicable to zero-runtime mode — `tastyStatic()` takes styles objects, not
   * props, so there is nothing for middleware to run on. Components rendered
   * through `tasty()` are unaffected and keep the runtime injector.
   *
   * @example
   * ```ts
   * configure({
   *   propHandlers: {
   *     glaze: (props) => {
   *       const { glaze, ...rest } = props;
   *       if (!glaze) return rest;
   *       return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
   *     },
   *   },
   * });
   *
   * <Element glaze="purple" />
   * ```
   */
  propHandlers?: Record<string, PropHandlerDefinition>;
  /**
   * Style properties exposed as top-level props on **every** tasty component, in
   * addition to the built-in base styles, without each component listing them in
   * `styleProps`.
   *
   * Augment `TastyBaseStylePropNames` to type them. Each name costs one property
   * check per render of every component, so keep the list short; the effect is
   * app-global and cannot be scoped to a subtree.
   *
   * @example
   * ```ts
   * configure({ baseStyleProps: ['radius', 'shadow'] });
   *
   * <Card radius="1r" shadow />
   * ```
   */
  baseStyleProps?: readonly string[];
  /**
   * Design tokens injected as CSS custom properties on `:root`.
   * Values are parsed through the Tasty DSL. Supports state maps
   * for responsive/theme-aware tokens.
   *
   * - `$name` keys become `--name` CSS custom properties
   * - `#name` keys become `--name-color` properties
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
   * tokens (`$name`/`#name` definitions), local states, `@keyframes`, and `@property`.
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
  /**
   * Typography presets — shorthand for `generateTypographyTokens()`.
   * Accepts the same input and internally generates typography tokens
   * that are merged into `tokens`. Explicit `tokens` override preset-generated ones.
   *
   * @example
   * ```ts
   * configure({
   *   presets: {
   *     h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
   *     t2: { fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
   *   },
   *   tokens: {
   *     // Overrides the preset-generated $t2-font-weight
   *     '$t2-font-weight': { '': '400', '@dark': '300' },
   *   },
   * });
   * ```
   */
  presets?: Record<string, TypographyPreset>;
  /**
   * Global Tasty styles keyed by CSS selector.
   * Each entry applies the full Tasty style syntax (style properties,
   * tokens, state maps, selector-based sub-styling) to the given selector.
   * Injected alongside `:root` tokens when the first style is rendered.
   *
   * @example
   * ```ts
   * configure({
   *   globalStyles: {
   *     body: { fill: '#surface', color: '#text', preset: 't2', margin: 0 },
   *     html: { overflow: 'hidden' },
   *   },
   * });
   * ```
   */
  globalStyles?: Record<string, Styles>;
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

// Current configuration (null until first configure() or auto-configured on first use)
let currentConfig: TastyConfig | null = null;

// Global keyframes storage (null = no keyframes configured, empty object checked via hasGlobalKeyframes)
let globalKeyframes: Record<string, KeyframesSteps> | null = null;

// Global recipes storage (null = no recipes configured)
let globalRecipes: Record<string, RecipeStyles> | null = null;

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

  // Check for simulated DOM environments (common in tests)
  if (typeof window !== 'undefined') {
    const ua = window.navigator?.userAgent;
    if (ua?.includes('jsdom') || ua?.includes('HappyDOM')) {
      return true;
    }
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
    namePrefix: DEFAULT_NAME_PREFIX,
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
  if (!markStylesGeneratedState()) return;

  // When SSR styles are already in the document, the SSR collector's
  // collectInternals() already rendered tokens, @property, globalStyles,
  // @font-face, @counter-style, and @function. Skip client-side injection to
  // avoid duplicate CSS rules.
  if (
    typeof document !== 'undefined' &&
    document.querySelector('[data-tasty-ssr]')
  ) {
    warnOnce(
      'ssr-globals-skip',
      '[Tasty] SSR styles detected — skipping client-side global CSS injection to avoid duplicates.',
    );
    return;
  }

  const injector = getGlobalInjector();
  const globalFontFaces = getGlobalFontFaces();
  const globalCounterStyles = getGlobalCounterStyles();
  const globalFunctions = getGlobalFunctions();
  const globalTokens = getGlobalConfigTokens();
  const configuredGlobalStyles = getGlobalStyles();

  // Inject all properties (defaults merged with user-configured overrides)
  for (const [token, definition] of Object.entries(getEffectiveProperties())) {
    injector.property(token, definition);
  }

  // Inject global @font-face rules (eagerly — fonts should be available before render)
  if (globalFontFaces && Object.keys(globalFontFaces).length > 0) {
    for (const [family, input] of Object.entries(globalFontFaces)) {
      const descriptors = Array.isArray(input) ? input : [input];
      for (const desc of descriptors) {
        injector.fontFace(family, desc);
      }
    }
  }

  // Inject global @counter-style rules (eagerly, weakly — never override a
  // component-local definition of the same name)
  if (globalCounterStyles && Object.keys(globalCounterStyles).length > 0) {
    for (const [name, descriptors] of Object.entries(globalCounterStyles)) {
      injector.counterStyle(name, descriptors, { weak: true });
    }
  }

  // Inject global @function rules (eagerly, weakly — never override a
  // component-local definition of the same name)
  if (globalFunctions && Object.keys(globalFunctions).length > 0) {
    for (const [name, definition] of Object.entries(globalFunctions)) {
      injector.func(name, definition, { weak: true });
    }
  }

  // Inject configured tokens as :root CSS custom properties
  if (globalTokens && Object.keys(globalTokens).length > 0) {
    const tokenRules = renderStyles(globalTokens, ':root') as StyleResult[];
    if (tokenRules.length > 0) {
      injector.injectGlobal(tokenRules);
    }
  }

  // Inject configured global styles
  if (configuredGlobalStyles) {
    for (const [selector, styles] of Object.entries(configuredGlobalStyles)) {
      if (Object.keys(styles).length > 0) {
        const rules = renderStyles(styles, selector) as StyleResult[];
        if (rules.length > 0) {
          injector.injectGlobal(rules);
        }
      }
    }
  }
}

/**
 * Check if styles have been generated (configuration is locked)
 */
export { hasStylesGenerated } from './config-state';

/**
 * Reset styles generated flag (for testing only)
 */
export function resetStylesGenerated(): void {
  resetStylesGeneratedState();
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
  if (hasStylesGenerated()) {
    warnOnce(
      'keyframes-after-styles',
      `[Tasty] Cannot update keyframes after styles have been generated.\n` +
        `The new keyframes will be ignored.`,
    );
    return;
  }
  globalKeyframes = { ...(globalKeyframes ?? {}), ...keyframes };
  _hasGlobalKeyframes = Object.keys(globalKeyframes).length > 0;
}

// ============================================================================
// Global Properties Management
// ============================================================================

/**
 * Set global properties (called from configure).
 * Internal use only.
 */
function setGlobalProperties(
  properties: Record<string, PropertyDefinition>,
): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'properties-after-styles',
      `[Tasty] Cannot update properties after styles have been generated.\n` +
        `The new properties will be ignored.`,
    );
    return;
  }
  mergeGlobalProperties(properties);
}

// ============================================================================
// Global Font Face Management
// ============================================================================

/**
 * Set global font faces (called from configure).
 * Internal use only.
 */
function setGlobalFontFace(fontFace: Record<string, FontFaceInput>): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'fontface-after-styles',
      `[Tasty] Cannot update fontFaces after styles have been generated.\n` +
        `The new font faces will be ignored.`,
    );
    return;
  }
  mergeGlobalFontFaces(fontFace);
}

// ============================================================================
// Global Counter Style Management
// ============================================================================

/**
 * Set global counter styles (called from configure).
 * Internal use only.
 */
function setGlobalCounterStyle(
  counterStyle: Record<string, CounterStyleDescriptors>,
): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'counterstyle-after-styles',
      `[Tasty] Cannot update counterStyles after styles have been generated.\n` +
        `The new counter styles will be ignored.`,
    );
    return;
  }
  mergeGlobalCounterStyles(counterStyle);
}

// ============================================================================
// Global Function Management
// ============================================================================

/**
 * Set global functions (called from configure).
 * Internal use only.
 */
function setGlobalFunction(
  functions: Record<string, FunctionDefinition>,
): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'function-after-styles',
      `[Tasty] Cannot update functions after styles have been generated.\n` +
        `The new functions will be ignored.`,
    );
    return;
  }
  mergeGlobalFunctions(functions);
}

// ============================================================================
// Polyfills Management
// ============================================================================

/**
 * Whether the CSS `@function` polyfill (inline expansion) is enabled.
 * Reads from globalThis first for cross-module SSR/zero-runtime support.
 */
export { isFunctionsPolyfillEnabled } from './config-state';

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
  if (hasStylesGenerated()) {
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

  globalRecipes = { ...(globalRecipes ?? {}), ...recipes };
}

// ============================================================================
// Global Token Styles Management
// ============================================================================

/**
 * Set global token styles (called from configure).
 * Internal use only.
 */
function setGlobalConfigTokens(styles: ConfigTokens): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'tokens-after-styles',
      `[Tasty] Cannot update tokens after styles have been generated.\n` +
        `The new tokens will be ignored.`,
    );
    return;
  }
  mergeGlobalConfigTokens(styles);
}

// ============================================================================
// Global Styles Management
// ============================================================================

/**
 * Set configured global styles (called from configure).
 * Internal use only.
 */
function setGlobalStyles(styles: Record<string, Styles>): void {
  if (hasStylesGenerated()) {
    warnOnce(
      'globalStyles-after-styles',
      `[Tasty] Cannot update globalStyles after styles have been generated.\n` +
        `The new global styles will be ignored.`,
    );
    return;
  }
  mergeGlobalStyles(styles);
}

/**
 * Check if configuration is locked (styles have been generated)
 */
export function isConfigLocked(): boolean {
  return hasStylesGenerated();
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
  if (hasStylesGenerated()) {
    warnOnce(
      'configure-after-styles',
      `[Tasty] Cannot call configure() after styles have been generated.\n` +
        `Configuration must be done before the first render. The configuration will be ignored.`,
    );
    return;
  }

  // Validate namePrefix early so misconfiguration fails loudly before any
  // CSS is generated under a bad prefix.
  if (config.namePrefix !== undefined) {
    validateNamePrefix(config.namePrefix);
  }

  const normalized = normalizeConfig(config);
  const {
    propHandlers: mergedPropHandlers,
    propHandlerSources,
    baseStyleProps: mergedBaseStyleProps,
    properties: mergedProperties,
    keyframes: mergedKeyframes,
    fontFaces: mergedFontFaces,
    counterStyles: mergedCounterStyles,
    tokens: mergedConfigTokens,
    recipes: mergedRecipes,
    globalStyles: mergedGlobalStyles,
  } = normalized;

  const functionDefs = applyStyleConfig(config, normalized, warnOnce);

  if (!isFunctionsPolyfillEnabled() && Object.keys(functionDefs).length > 0) {
    setGlobalFunction(functionDefs);
  }

  // Handle keyframes
  if (Object.keys(mergedKeyframes).length > 0) {
    setGlobalKeyframes(mergedKeyframes);
  }

  // Handle properties
  if (Object.keys(mergedProperties).length > 0) {
    setGlobalProperties(mergedProperties);
  }

  // Handle font faces
  if (Object.keys(mergedFontFaces).length > 0) {
    setGlobalFontFace(mergedFontFaces);
  }

  // Handle counter styles
  if (Object.keys(mergedCounterStyles).length > 0) {
    setGlobalCounterStyle(mergedCounterStyles);
  }

  // Handle props middleware
  if (Object.keys(mergedPropHandlers).length > 0) {
    for (const [name, definition] of Object.entries(mergedPropHandlers)) {
      registerPropHandler(name, definition, {
        source: propHandlerSources.get(name),
      });
    }
  }

  // Handle promoted base style props
  if (mergedBaseStyleProps.length > 0) {
    registerBaseStyleProps(mergedBaseStyleProps);
  }

  // Handle tokens (CSS custom properties on :root)
  if (Object.keys(mergedConfigTokens).length > 0) {
    setGlobalConfigTokens(mergedConfigTokens);
  }

  // Handle recipes
  if (Object.keys(mergedRecipes).length > 0) {
    setGlobalRecipes(mergedRecipes);
  }

  // Handle global styles
  if (Object.keys(mergedGlobalStyles).length > 0) {
    setGlobalStyles(mergedGlobalStyles);
  }

  const {
    states: _states,
    parserCacheSize: _parserCacheSize,
    units: _units,
    functions: _functions,
    polyfills: _polyfills,
    plugins: _plugins,
    keyframes: _keyframes,
    properties: _properties,
    fontFaces: _fontFaces,
    counterStyles: _counterStyles,
    handlers: _handlers,
    propHandlers: _propHandlers,
    baseStyleProps: _baseStyleProps,
    tokens: _tokens,
    replaceTokens: _replaceTokens,
    recipes: _recipes,
    colorSpace: _colorSpace,
    presets: _presets,
    globalStyles: _globalStyles,
    ...injectorConfig
  } = config;

  const fullConfig: TastyConfig = {
    ...createDefaultConfig(),
    ...currentConfig,
    ...injectorConfig,
  };

  // Store the config
  currentConfig = fullConfig;
  setRuntimeConfigState(fullConfig);

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
  if (currentConfig) return currentConfig;

  const defaultConfig = createDefaultConfig(isTestEnvironment());
  currentConfig = defaultConfig;
  setRuntimeConfigState(defaultConfig);
  return defaultConfig;
}

/**
 * Get the configured prefix used for every generated identifier
 * (class names, keyframe names, counter-style names).
 *
 * Falls back to the default prefix (`'t'`) when `configure()` has not
 * been called yet — this matches the auto-configuration behavior used
 * by the rest of the system.
 */
export function getNamePrefix(): string {
  return currentConfig?.namePrefix ?? DEFAULT_NAME_PREFIX;
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
  resetStylesGeneratedState();
  currentConfig = null;
  globalKeyframes = null;
  _hasGlobalKeyframes = false;
  resetGlobalPolyfillsState();
  globalRecipes = null;
  resetConfigResources();
  resetGlobalPredefinedTokens();
  resetGlobalParseFunctions();
  resetFunctionPolyfills();
  resetHandlers();
  resetStyleChunks();
  resetPropHandlers();
  resetBaseStyleProps();
  clearPipelineCache();
  emittedWarnings.clear();
  resetStyleWarnings();

  const storage: TastyGlobalStorage =
    typeof window !== 'undefined' ? window : globalThis;
  delete storage[GLOBAL_INJECTOR_KEY];
}
