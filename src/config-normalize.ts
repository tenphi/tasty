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

/** Merge an optional configuration record into an accumulated record. */
function mergeRecord<T extends object>(target: T, source?: Partial<T>): T {
  return source ? { ...target, ...source } : target;
}

/** Merge a named extension record and retain where each winning entry came from. */
function mergeSourcedRecord<T>(
  target: Record<string, T>,
  source: Record<string, T> | undefined,
  sources: Map<string, string>,
  pluginName?: string,
): Record<string, T> {
  if (!source) return target;

  const label =
    pluginName === undefined ? 'configure()' : `plugin "${pluginName}"`;
  for (const key of Object.keys(source)) sources.set(key, label);

  return { ...target, ...source };
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
    states = mergeRecord(states, plugin.states);
    units = mergeRecord(units, plugin.units);
    functions = mergeRecord(functions, plugin.functions);
    handlers = mergeSourcedRecord(
      handlers,
      plugin.handlers,
      handlerSources,
      plugin.name,
    );
    propHandlers = mergeSourcedRecord(
      propHandlers,
      plugin.propHandlers,
      propHandlerSources,
      plugin.name,
    );
    if (plugin.baseStyleProps) baseStyleProps.push(...plugin.baseStyleProps);
    properties = mergeRecord(properties, plugin.properties);
    keyframes = mergeRecord(keyframes, plugin.keyframes);
    fontFaces = mergeRecord(fontFaces, plugin.fontFaces);
    counterStyles = mergeRecord(counterStyles, plugin.counterStyles);
    replaceTokens = mergeRecord(replaceTokens, plugin.replaceTokens);
    tokens = mergeRecord(tokens, plugin.tokens);
    recipes = mergeRecord(recipes, plugin.recipes);
    presets = mergeRecord(presets, plugin.presets);
    mergeGlobalStyles(globalStyles, plugin.globalStyles);
  }

  states = mergeRecord(states, config.states);
  units = mergeRecord(units, config.units);
  functions = mergeRecord(functions, config.functions);
  handlers = mergeSourcedRecord(handlers, config.handlers, handlerSources);
  propHandlers = mergeSourcedRecord(
    propHandlers,
    config.propHandlers,
    propHandlerSources,
  );
  if (config.baseStyleProps) baseStyleProps.push(...config.baseStyleProps);
  properties = mergeRecord(properties, config.properties);
  keyframes = mergeRecord(keyframes, config.keyframes);
  fontFaces = mergeRecord(fontFaces, config.fontFaces);
  counterStyles = mergeRecord(counterStyles, config.counterStyles);
  replaceTokens = mergeRecord(replaceTokens, config.replaceTokens);
  presets = mergeRecord(presets, config.presets);

  if (Object.keys(presets).length > 0) {
    tokens = { ...generateTypographyTokens(presets), ...tokens };
  }

  tokens = mergeRecord(tokens, config.tokens);
  recipes = mergeRecord(recipes, config.recipes);
  mergeGlobalStyles(globalStyles, config.globalStyles);

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
  source?: Record<string, Styles>,
): void {
  if (!source) return;

  for (const [selector, styles] of Object.entries(source)) {
    target[selector] = target[selector]
      ? { ...target[selector], ...styles }
      : styles;
  }
}
