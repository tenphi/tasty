/**
 * Configuration processing shared by runtime and build-time paths.
 *
 * Plugins are folded first and direct configuration wins. Keeping this step
 * independent from the DOM injector lets zero-runtime tooling reuse the exact
 * same precedence and style-engine setup without loading browser infrastructure.
 */

import { registerFunctionPolyfill, splitFunctions } from './functions';
import {
  isFunctionsPolyfillEnabled,
  setGlobalPolyfillsState,
} from './config-state';
import { setGlobalPredefinedStates } from './states';
import {
  normalizeHandlerDefinition,
  registerHandler,
} from './styles/predefined';
import {
  CUSTOM_UNITS,
  getGlobalParseFunctions,
  getGlobalParser,
  normalizeColorTokenValue,
  setGlobalPredefinedTokens,
} from './utils/styles';
import { generateTypographyTokens } from './utils/typography';

import type { TastyConfig } from './config';
import type { FunctionsConfig } from './functions';
import type {
  CounterStyleDescriptors,
  FontFaceInput,
  FunctionDefinition,
  KeyframesSteps,
  PropertyDefinition,
} from './injector/types';
import type { UnitHandler } from './parser/types';
import type { PropHandlerDefinition } from './prop-handlers';
import type { ConfigTokens, RecipeStyles, Styles } from './styles/types';
import type { StyleHandlerDefinition } from './utils/styles';
import type { TypographyPreset } from './utils/typography';

export interface NormalizedConfig {
  states: Record<string, string>;
  units: Record<string, string | UnitHandler>;
  functions: FunctionsConfig;
  handlers: Record<string, StyleHandlerDefinition>;
  handlerSources: Map<string, string>;
  propHandlers: Record<string, PropHandlerDefinition>;
  propHandlerSources: Map<string, string>;
  baseStyleProps: string[];
  properties: Record<string, PropertyDefinition>;
  keyframes: Record<string, KeyframesSteps>;
  fontFaces: Record<string, FontFaceInput>;
  counterStyles: Record<string, CounterStyleDescriptors>;
  replaceTokens: Record<string, string | number | boolean>;
  tokens: ConfigTokens;
  recipes: Record<string, RecipeStyles>;
  globalStyles: Record<string, Styles>;
}

type WarnOnce = (key: string, message: string) => void;

/** Apply parser and style-engine configuration shared by every renderer. */
export function applyStyleConfig(
  config: Partial<TastyConfig>,
  normalized: NormalizedConfig,
  warnOnce: WarnOnce,
): Record<string, FunctionDefinition> {
  const tokenKeys = new Set(Object.keys(normalized.tokens));
  for (const key of Object.keys(normalized.replaceTokens)) {
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

  if (config.colorSpace) {
    warnOnce(
      'colorSpace-deprecated',
      '[Tasty] configure({ colorSpace }) no longer has any effect and will be ' +
        'removed in the next major. Colors are emitted as authored, and opacity ' +
        "is applied with relative color syntax, which reads a color's channels " +
        'in the browser. To address channels yourself, write ' +
        '`oklch(from var(--name-color) l c h)` against the token.',
    );
  }

  if (Object.keys(normalized.states).length > 0) {
    setGlobalPredefinedStates(normalized.states);
  }

  const parser = getGlobalParser();
  if (config.parserCacheSize !== undefined) {
    parser.updateOptions({ cacheSize: config.parserCacheSize });
  }
  if (Object.keys(normalized.units).length > 0) {
    const currentUnits = parser.getUnits() ?? CUSTOM_UNITS;
    parser.setUnits({ ...currentUnits, ...normalized.units });
  }

  if (config.polyfills) setGlobalPolyfillsState(config.polyfills);

  const { parseFuncs, functionDefs } = splitFunctions(
    normalized.functions,
    (key, kind) => {
      warnOnce(
        `functions-mismatch-${key}`,
        kind === 'expected-definition'
          ? `[Tasty] functions["${key}"]: a "$$"-prefixed key denotes a CSS @function ` +
              `and expects a definition object, but received a function. Entry ignored.`
          : `[Tasty] functions["${key}"]: a bare key denotes a parse function and ` +
              `expects a function value, but received an object. ` +
              `Did you mean "$$${key}"? Entry ignored.`,
      );
    },
  );

  if (Object.keys(parseFuncs).length > 0) {
    const currentFuncs = getGlobalParseFunctions();
    parser.setFunctions({ ...currentFuncs, ...parseFuncs });
    Object.assign(currentFuncs, parseFuncs);
  }

  if (isFunctionsPolyfillEnabled()) {
    for (const [name, definition] of Object.entries(functionDefs)) {
      registerFunctionPolyfill(name, definition);
    }
  }

  for (const [name, definition] of Object.entries(normalized.handlers)) {
    const handler = normalizeHandlerDefinition(name, definition);
    registerHandler(handler, {
      key: name,
      source: normalized.handlerSources.get(name),
    });
  }

  if (Object.keys(normalized.replaceTokens).length > 0) {
    const processedTokens: Record<string, string> = {};
    for (const [key, value] of Object.entries(normalized.replaceTokens)) {
      if (key.startsWith('#')) {
        const normalizedValue = normalizeColorTokenValue(value);
        if (normalizedValue === null) continue;
        processedTokens[key] = String(normalizedValue);
      } else if (value !== false) {
        processedTokens[key] = String(value);
      }
    }
    setGlobalPredefinedTokens(processedTokens);
  }

  return functionDefs;
}

export function normalizeConfig(
  config: Partial<TastyConfig>,
): NormalizedConfig {
  let states: Record<string, string> = {};
  let units: Record<string, string | UnitHandler> = {};
  let functions: FunctionsConfig = {};
  let handlers: Record<string, StyleHandlerDefinition> = {};
  const handlerSources = new Map<string, string>();
  let propHandlers: Record<string, PropHandlerDefinition> = {};
  const propHandlerSources = new Map<string, string>();
  const baseStyleProps: string[] = [];
  let properties: Record<string, PropertyDefinition> = {};
  let keyframes: Record<string, KeyframesSteps> = {};
  let fontFaces: Record<string, FontFaceInput> = {};
  let counterStyles: Record<string, CounterStyleDescriptors> = {};
  let replaceTokens: Record<string, string | number | boolean> = {};
  let tokens: ConfigTokens = {} as ConfigTokens;
  let recipes: Record<string, RecipeStyles> = {};
  let presets: Record<string, TypographyPreset> = {};
  const globalStyles: Record<string, Styles> = {};

  for (const plugin of config.plugins ?? []) {
    if (plugin.states) states = { ...states, ...plugin.states };
    if (plugin.units) units = { ...units, ...plugin.units };
    if (plugin.functions) functions = { ...functions, ...plugin.functions };
    if (plugin.handlers) {
      handlers = { ...handlers, ...plugin.handlers };
      for (const key of Object.keys(plugin.handlers)) {
        handlerSources.set(key, `plugin "${plugin.name}"`);
      }
    }
    if (plugin.propHandlers) {
      propHandlers = { ...propHandlers, ...plugin.propHandlers };
      for (const key of Object.keys(plugin.propHandlers)) {
        propHandlerSources.set(key, `plugin "${plugin.name}"`);
      }
    }
    if (plugin.baseStyleProps) baseStyleProps.push(...plugin.baseStyleProps);
    if (plugin.properties) {
      properties = { ...properties, ...plugin.properties };
    }
    if (plugin.keyframes) keyframes = { ...keyframes, ...plugin.keyframes };
    if (plugin.fontFaces) fontFaces = { ...fontFaces, ...plugin.fontFaces };
    if (plugin.counterStyles) {
      counterStyles = { ...counterStyles, ...plugin.counterStyles };
    }
    if (plugin.replaceTokens) {
      replaceTokens = { ...replaceTokens, ...plugin.replaceTokens };
    }
    if (plugin.tokens) tokens = { ...tokens, ...plugin.tokens };
    if (plugin.recipes) recipes = { ...recipes, ...plugin.recipes };
    if (plugin.presets) presets = { ...presets, ...plugin.presets };
    if (plugin.globalStyles) {
      mergeGlobalStyles(globalStyles, plugin.globalStyles);
    }
  }

  if (config.states) states = { ...states, ...config.states };
  if (config.units) units = { ...units, ...config.units };
  if (config.functions) functions = { ...functions, ...config.functions };
  if (config.handlers) {
    handlers = { ...handlers, ...config.handlers };
    for (const key of Object.keys(config.handlers)) {
      handlerSources.set(key, 'configure()');
    }
  }
  if (config.propHandlers) {
    propHandlers = { ...propHandlers, ...config.propHandlers };
    for (const key of Object.keys(config.propHandlers)) {
      propHandlerSources.set(key, 'configure()');
    }
  }
  if (config.baseStyleProps) baseStyleProps.push(...config.baseStyleProps);
  if (config.properties) properties = { ...properties, ...config.properties };
  if (config.keyframes) keyframes = { ...keyframes, ...config.keyframes };
  if (config.fontFaces) fontFaces = { ...fontFaces, ...config.fontFaces };
  if (config.counterStyles) {
    counterStyles = { ...counterStyles, ...config.counterStyles };
  }
  if (config.replaceTokens) {
    replaceTokens = { ...replaceTokens, ...config.replaceTokens };
  }
  if (config.presets) presets = { ...presets, ...config.presets };

  if (Object.keys(presets).length > 0) {
    tokens = { ...generateTypographyTokens(presets), ...tokens };
  }

  if (config.tokens) tokens = { ...tokens, ...config.tokens };
  if (config.recipes) recipes = { ...recipes, ...config.recipes };
  if (config.globalStyles) mergeGlobalStyles(globalStyles, config.globalStyles);

  return {
    states,
    units,
    functions,
    handlers,
    handlerSources,
    propHandlers,
    propHandlerSources,
    baseStyleProps,
    properties,
    keyframes,
    fontFaces,
    counterStyles,
    replaceTokens,
    tokens,
    recipes,
    globalStyles,
  };
}

function mergeGlobalStyles(
  target: Record<string, Styles>,
  source: Record<string, Styles>,
): void {
  for (const [selector, styles] of Object.entries(source)) {
    target[selector] = target[selector]
      ? { ...target[selector], ...styles }
      : styles;
  }
}
