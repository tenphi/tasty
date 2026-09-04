// Configuration API
export {
  configure,
  getConfig,
  getNamePrefix,
  isConfigLocked,
  hasStylesGenerated,
  resetConfig,
  isTestEnvironment,
  hasGlobalKeyframes,
  getGlobalKeyframes,
  getGlobalFontFaces,
  getGlobalCounterStyles,
  getGlobalFunctions,
  hasGlobalRecipes,
  getGlobalRecipes,
} from '../config';
export type { TastyConfig } from '../config';
export type { ColorSpace } from '../utils/color-space';
export {
  DEFAULT_NAME_PREFIX,
  DEFAULT_ZERO_NAME_PREFIX,
} from '../utils/name-prefix';

// Plugins
export {
  okhslPlugin,
  okhslFunction,
  okhstPlugin,
  okhstFunction,
  createColorFunc,
} from '../plugins';
export { resolveFunctionColor } from '../utils/function-color';
// Types of the public `functions` config/plugin field.
export type { FunctionsConfig, ParseFunction } from '../functions';
export type { TastyPlugin, TastyPluginFactory } from '../plugins';
export type {
  PropHandler,
  PropHandlerDefinition,
  PropHandlerProps,
} from '../prop-handlers';

// Chunk utilities
export {
  APPEARANCE_CHUNK_STYLES,
  FONT_CHUNK_STYLES,
  DIMENSION_CHUNK_STYLES,
  DISPLAY_CHUNK_STYLES,
  LAYOUT_CHUNK_STYLES,
  POSITION_CHUNK_STYLES,
  CHUNK_NAMES,
  STYLE_TO_CHUNK,
  categorizeStyleKeys,
} from '../chunks';
export type { ChunkName, ChunkInfo } from '../chunks';

// State mapping utilities
export {
  getGlobalPredefinedStates,
  setGlobalPredefinedStates,
  createStateParserContext,
} from '../states';
export type {
  StateParserContext,
  ParsedAdvancedState,
  AtRuleContext,
} from '../states';

// Style handlers & definitions
export { defineHandler, styleHandlers } from '../styles';
export * from '../styles/list';

// Pipeline
export { renderStyles, isSelector, parseStateKey } from '../pipeline';
export type { StyleResult, RenderResult, ConditionNode } from '../pipeline';
export type { ParseStateKeyOptions } from '../pipeline/parseStateKey';

// Parser
export { StyleParser } from '../parser/parser';
export type {
  StyleDetails,
  StyleDetailsPart,
  ProcessedStyle,
  ParserOptions,
  UnitHandler,
} from '../parser/types';

// Style computation (hook-free)
export { computeStyles } from '../compute-styles';
export type {
  ComputeStylesResult,
  ComputeStylesOptions,
} from '../compute-styles';

// Injector
export * from '../injector';

// Utilities
export * from '../utils/filter-base-props';
export * from '../utils/colors';
export {
  CUSTOM_UNITS,
  DIRECTIONS,
  filterMods,
  getGlobalParser,
  getGlobalPredefinedTokens,
  getNamedColorHex,
  getRgbValuesFromRgbaString,
  hexToRgb,
  normalizeColorTokenValue,
  parseColor,
  parseStyle,
  stringifyStyles,
  strToRgb,
} from '../utils/styles';
export type {
  AnyStyleHandler,
  CSSMap,
  ParsedColor,
  RawStyleHandler,
  ResolvedStyleValue,
  StyleHandler,
  StyleHandlerDefinition,
  StyleHandlerProps,
  StyleHandlerResult,
  StyleMap,
  StylePropValue,
  StyleValue,
  StyleValueStateMap,
} from '../utils/styles';
export * from '../utils/mod-attrs';
export * from '../utils/merge-styles';
export { resolveRecipes } from '../utils/resolve-recipes';
export * from '../utils/process-tokens';
export * from '../utils/typography';

// CSS type utilities
export type { CSSProperties } from '../utils/css-types';

// Debug
export * from '../debug';

// Framework-agnostic types
export type {
  BaseStyleProps,
  DimensionStyleProps,
  ColorStyleProps,
  OuterStyleProps,
  PositionStyleProps,
  TextStyleProps,
  BlockStyleProps,
  BlockInnerStyleProps,
  BlockOuterStyleProps,
  ContainerStyleProps,
  FlowStyleProps,
  InnerStyleProps,
  ShortGridStyles,
  TagName,
  Mods,
  ModValue,
  Tokens,
  TokenValue,
  TastyExtensionConfig,
  TastyThemeNames,
  TastyCustomProps,
  TastyBaseStylePropNames,
  ExtraBaseStyleProps,
} from '../types';

// Style types
export type {
  StylesInterface,
  Styles,
  StylesWithoutSelectors,
  RecipeStyles,
  ConfigTokens,
  ConfigTokenValue,
  NoType,
  Selector,
  SuffixForSelector,
  NotSelector,
  TastyNamedColors,
  TastyPresetNames,
} from '../styles/types';
