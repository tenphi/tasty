import type { FunctionsConfig } from '../functions';
import type {
  CounterStyleDescriptors,
  FontFaceInput,
  KeyframesSteps,
  PropertyDefinition,
} from '../injector/types';
import type { UnitHandler } from '../parser/types';
import type { PropHandlerDefinition } from '../prop-handlers';
import type { RecipeStyles, ConfigTokens, Styles } from '../styles/types';
import type { StyleHandlerDefinition } from '../utils/styles';
import type { TypographyPreset } from '../utils/typography';

/**
 * A tasty plugin that extends the style system with custom functions, units, states, or handlers.
 */
export interface TastyPlugin {
  /** Unique name for the plugin (used for debugging and conflict detection) */
  name: string;
  /**
   * Custom functions (unified map). Bare keys map to parse functions
   * `(groups) => string`; `$$name` keys map to declarative CSS `@function`
   * definitions. See {@link FunctionsConfig}.
   */
  functions?: FunctionsConfig;
  /** Custom units that transform numeric values (e.g., `2x` → `calc(2 * var(--gap))`) */
  units?: Record<string, string | UnitHandler>;
  /** Custom state aliases (e.g., `'@mobile': '@media(w < 768px)'`) */
  states?: Record<string, string>;
  /**
   * Custom style handlers that transform style properties into CSS declarations.
   * Handlers replace built-in handlers for the same style name.
   * @example
   * ```ts
   * handlers: {
   *   // Simple handler - lookup style inferred from key
   *   fill: ({ fill }) => fill ? { 'background-color': fill } : undefined,
   *   // Multi-property handler
   *   spacing: [['gap', 'padding'], ({ gap, padding }) => ({ ... })],
   * }
   * ```
   */
  handlers?: Record<string, StyleHandlerDefinition>;
  /**
   * Props middleware for every tasty component — props in, props out. The
   * extension point for props that are not style properties: read a custom prop,
   * strip it so it never reaches the DOM, and fold its meaning into `styles`,
   * `mods`, `tokens`, `variant`, or `as`.
   *
   * Must be pure and must not mutate its input.
   * See {@link TastyConfig.propHandlers}.
   * @example
   * ```ts
   * propHandlers: {
   *   glaze: (props) => {
   *     const { glaze, ...rest } = props;
   *     if (!glaze) return rest;
   *     return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
   *   },
   * }
   * ```
   */
  propHandlers?: Record<string, PropHandlerDefinition>;
  /**
   * Style properties exposed as top-level props on every tasty component, in
   * addition to the built-in base styles.
   * See {@link TastyConfig.baseStyleProps}.
   */
  baseStyleProps?: readonly string[];
  /**
   * Design tokens injected as CSS custom properties on `:root`.
   * Values are parsed through the Tasty DSL. Supports state maps.
   * - `$name` → `--name` CSS custom property
   * - `#name` → `--name-color`
   */
  tokens?: ConfigTokens;
  /** Predefined tokens replaced during style parsing (`$name` or `#name`) */
  replaceTokens?: Record<`$${string}` | `#${string}`, string | number>;
  /**
   * Predefined style recipes -- named style bundles that can be applied via `recipe` style property.
   * Recipe values are flat tasty styles (no sub-element keys).
   * @example
   * ```ts
   * recipes: {
   *   card: { padding: '4x', fill: '#surface', radius: '1r', border: true },
   *   elevated: { shadow: '2x 2x 4x #shadow' },
   * }
   * ```
   */
  recipes?: Record<string, RecipeStyles>;
  /**
   * Typography presets — shorthand for `generateTypographyTokens()`.
   * Generated tokens are merged under explicit `tokens` (tokens win on conflict).
   */
  presets?: Record<string, TypographyPreset>;
  /**
   * Global Tasty styles keyed by CSS selector.
   * Supports the full Tasty style syntax.
   */
  globalStyles?: Record<string, Styles>;
  /**
   * Global CSS `@property` definitions. A plugin whose handler or prop handler
   * emits a custom property usually wants one, so the property animates and
   * inherits correctly instead of being treated as an untyped string.
   * See {@link TastyConfig.properties}.
   */
  properties?: Record<string, PropertyDefinition>;
  /** Global keyframes, injected only when referenced. See {@link TastyConfig.keyframes}. */
  keyframes?: Record<string, KeyframesSteps>;
  /** Global `@font-face` definitions. See {@link TastyConfig.fontFaces}. */
  fontFaces?: Record<string, FontFaceInput>;
  /** Global `@counter-style` definitions. See {@link TastyConfig.counterStyles}. */
  counterStyles?: Record<string, CounterStyleDescriptors>;
}

/**
 * A factory function that creates a TastyPlugin.
 * Can optionally accept configuration options.
 *
 * @example
 * ```ts
 * // Plugin without options
 * const okhslPlugin: TastyPluginFactory = () => ({
 *   name: 'okhsl',
 *   functions: { okhsl: okhslFunction },
 * });
 *
 * // Plugin with options
 * const debugPlugin: TastyPluginFactory<{ verbose: boolean }> = (options) => ({
 *   name: 'debug',
 *   functions: { debug: createDebugFunc(options.verbose) },
 * });
 * ```
 */
export type TastyPluginFactory<TOptions = void> = TOptions extends void
  ? () => TastyPlugin
  : (options: TOptions) => TastyPlugin;
