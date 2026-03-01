// Configuration API
export {
  configure,
  getConfig,
  isConfigLocked,
  hasStylesGenerated,
  resetConfig,
  isTestEnvironment,
  hasGlobalKeyframes,
  getGlobalKeyframes,
  hasGlobalRecipes,
  getGlobalRecipes,
} from '../config';
export type { TastyConfig } from '../config';

// Plugins
export { okhslPlugin, okhslFunc } from '../plugins';
export type { TastyPlugin, TastyPluginFactory } from '../plugins';

// Chunk utilities
export { CHUNK_NAMES, STYLE_TO_CHUNK, categorizeStyleKeys } from '../chunks';
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
export { styleHandlers } from '../styles';
export * from '../styles/list';

// Pipeline
export { renderStyles, isSelector, parseStateKey } from '../pipeline';
export type {
  StyleResult,
  RenderResult,
  ConditionNode,
} from '../pipeline';
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
export { Bucket } from '../parser/types';

// Injector
export * from '../injector';

// Utilities
export * from '../utils/filter-base-props';
export * from '../utils/colors';
export * from '../utils/styles';
export * from '../utils/mod-attrs';
export * from '../utils/dotize';
export * from '../utils/merge-styles';
export { resolveRecipes } from '../utils/resolve-recipes';
export * from '../utils/warnings';
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
  GlobalStyledProps,
  Props,
  TagName,
  Mods,
  ModValue,
  Tokens,
  TokenValue,
  TastyExtensionConfig,
  TastyThemeNames,
} from '../types';

// Style types
export type {
  StylesInterface,
  Styles,
  StylesWithoutSelectors,
  RecipeStyles,
  NoType,
  Selector,
  SuffixForSelector,
  NotSelector,
  TastyNamedColors,
  TastyPresetNames,
} from '../styles/types';
