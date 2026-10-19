/**
 * DOM-free storage for configured CSS resources shared by the browser runtime
 * and server collectors.
 *
 * Astro can evaluate middleware and application code in separate module
 * graphs, so resources used by SSR are mirrored on globalThis. Keeping this
 * state outside config.ts lets server-only entrypoints read it without loading
 * StyleInjector and the rest of the browser runtime.
 */

import type {
  CounterStyleDescriptors,
  FontFaceInput,
  FunctionDefinition,
  KeyframesSteps,
  PropertyDefinition,
} from './injector/types';
import { parsePropertyToken } from './properties';
import { DEFAULT_PROPERTIES } from './properties/defaults';
import type { ConfigTokens, Styles } from './styles/types';

interface RuntimeConfigState {
  namePrefix?: string;
  nonce?: string;
}

let runtimeConfig: RuntimeConfigState | null = null;
let globalFontFace: Record<string, FontFaceInput> | null = null;
let globalCounterStyle: Record<string, CounterStyleDescriptors> | null = null;
let globalFunction: Record<string, FunctionDefinition> | null = null;
let globalProperties: Record<string, PropertyDefinition> | null = null;
let globalConfigTokens: ConfigTokens | null = null;
let globalStyles: Record<string, Styles> | null = null;
let globalKeyframes: Record<string, KeyframesSteps> | null = null;

const GTKEY_TOKENS = '__tasty_cfg_tokens__';
const GTKEY_FONT_FACE = '__tasty_cfg_font_face__';
const GTKEY_COUNTER_STYLE = '__tasty_cfg_counter_style__';
const GTKEY_FUNCTION = '__tasty_cfg_function__';
const GTKEY_PROPERTIES = '__tasty_cfg_properties__';
const GTKEY_GLOBAL_STYLES = '__tasty_cfg_global_styles__';
const GTKEY_KEYFRAMES = '__tasty_cfg_keyframes__';

function setOnGlobalThis(key: string, value: unknown): void {
  (globalThis as Record<string, unknown>)[key] = value;
}

function getFromGlobalThis<T>(key: string): T | undefined {
  return (globalThis as Record<string, unknown>)[key] as T | undefined;
}

export function getRuntimeConfigState(): RuntimeConfigState | null {
  return runtimeConfig;
}

export function setRuntimeConfigState(config: RuntimeConfigState): void {
  runtimeConfig = config;
}

export function getEffectiveProperties(): Record<string, PropertyDefinition> {
  const properties =
    globalProperties ??
    getFromGlobalThis<Record<string, PropertyDefinition>>(GTKEY_PROPERTIES);
  return properties
    ? { ...DEFAULT_PROPERTIES, ...properties }
    : DEFAULT_PROPERTIES;
}

export interface EffectivePropertyEntry {
  /** The token the property was declared under (`#current`, `$gap`). */
  token: string;
  definition: PropertyDefinition;
}

let effectivePropertyIndex: {
  source: Record<string, PropertyDefinition> | null | undefined;
  index: ReadonlyMap<string, EffectivePropertyEntry>;
} | null = null;

/**
 * The effective properties keyed by the custom property each one registers
 * (`#current` → `--current-color`).
 *
 * Auto-inference consults it so a property Tasty already declares keeps its
 * own definition: otherwise a scan that meets `--current-color: …` registers it
 * a second time as a `<color>` with a guessed `transparent` initial value.
 * Rebuilt only when `configure({ properties })` replaces the set.
 */
export function getEffectivePropertiesByName(): ReadonlyMap<
  string,
  EffectivePropertyEntry
> {
  const source =
    globalProperties ??
    getFromGlobalThis<Record<string, PropertyDefinition>>(GTKEY_PROPERTIES);

  if (effectivePropertyIndex && effectivePropertyIndex.source === source) {
    return effectivePropertyIndex.index;
  }

  const index = new Map<string, EffectivePropertyEntry>();
  for (const [token, definition] of Object.entries(getEffectiveProperties())) {
    const parsed = parsePropertyToken(token);
    if (parsed.isValid) index.set(parsed.cssName, { token, definition });
  }

  effectivePropertyIndex = { source, index };
  return index;
}

export function getGlobalFontFaces(): Record<string, FontFaceInput> | null {
  return (
    globalFontFace ??
    getFromGlobalThis<Record<string, FontFaceInput>>(GTKEY_FONT_FACE) ??
    null
  );
}

export function getGlobalCounterStyles(): Record<
  string,
  CounterStyleDescriptors
> | null {
  return (
    globalCounterStyle ??
    getFromGlobalThis<Record<string, CounterStyleDescriptors>>(
      GTKEY_COUNTER_STYLE,
    ) ??
    null
  );
}

export function getGlobalFunctions(): Record<
  string,
  FunctionDefinition
> | null {
  return (
    globalFunction ??
    getFromGlobalThis<Record<string, FunctionDefinition>>(GTKEY_FUNCTION) ??
    null
  );
}

export function getGlobalConfigTokens(): ConfigTokens | null {
  return (
    globalConfigTokens ?? getFromGlobalThis<ConfigTokens>(GTKEY_TOKENS) ?? null
  );
}

export function getGlobalStyles(): Record<string, Styles> | null {
  return (
    globalStyles ??
    getFromGlobalThis<Record<string, Styles>>(GTKEY_GLOBAL_STYLES) ??
    null
  );
}

/**
 * Get global keyframes configuration.
 * Returns null if no keyframes configured (fast path for zero-overhead).
 */
export function getGlobalKeyframes(): Record<string, KeyframesSteps> | null {
  return (
    globalKeyframes ??
    getFromGlobalThis<Record<string, KeyframesSteps>>(GTKEY_KEYFRAMES) ??
    null
  );
}

export function mergeGlobalProperties(
  properties: Record<string, PropertyDefinition>,
): void {
  globalProperties = {
    ...(globalProperties ?? getFromGlobalThis(GTKEY_PROPERTIES) ?? {}),
    ...properties,
  };
  setOnGlobalThis(GTKEY_PROPERTIES, globalProperties);
}

export function mergeGlobalFontFaces(
  fontFaces: Record<string, FontFaceInput>,
): void {
  globalFontFace = { ...(getGlobalFontFaces() ?? {}), ...fontFaces };
  setOnGlobalThis(GTKEY_FONT_FACE, globalFontFace);
}

export function mergeGlobalCounterStyles(
  counterStyles: Record<string, CounterStyleDescriptors>,
): void {
  globalCounterStyle = {
    ...(getGlobalCounterStyles() ?? {}),
    ...counterStyles,
  };
  setOnGlobalThis(GTKEY_COUNTER_STYLE, globalCounterStyle);
}

export function mergeGlobalFunctions(
  functions: Record<string, FunctionDefinition>,
): void {
  globalFunction = { ...(getGlobalFunctions() ?? {}), ...functions };
  setOnGlobalThis(GTKEY_FUNCTION, globalFunction);
}

export function mergeGlobalConfigTokens(styles: ConfigTokens): void {
  globalConfigTokens = globalConfigTokens
    ? { ...globalConfigTokens, ...styles }
    : styles;
  setOnGlobalThis(GTKEY_TOKENS, globalConfigTokens);
}

export function mergeGlobalStyles(styles: Record<string, Styles>): void {
  if (globalStyles) {
    for (const [selector, selectorStyles] of Object.entries(styles)) {
      globalStyles[selector] = globalStyles[selector]
        ? { ...globalStyles[selector], ...selectorStyles }
        : selectorStyles;
    }
  } else {
    globalStyles = { ...styles };
  }
  setOnGlobalThis(GTKEY_GLOBAL_STYLES, globalStyles);
}

export function mergeGlobalKeyframes(
  keyframes: Record<string, KeyframesSteps>,
): void {
  globalKeyframes = { ...(getGlobalKeyframes() ?? {}), ...keyframes };
  setOnGlobalThis(GTKEY_KEYFRAMES, globalKeyframes);
}

export function resetConfigResources(): void {
  runtimeConfig = null;
  globalProperties = null;
  globalFontFace = null;
  globalCounterStyle = null;
  globalFunction = null;
  globalConfigTokens = null;
  globalStyles = null;
  globalKeyframes = null;

  const globalState = globalThis as Record<string, unknown>;
  delete globalState[GTKEY_TOKENS];
  delete globalState[GTKEY_FONT_FACE];
  delete globalState[GTKEY_COUNTER_STYLE];
  delete globalState[GTKEY_FUNCTION];
  delete globalState[GTKEY_PROPERTIES];
  delete globalState[GTKEY_GLOBAL_STYLES];
  delete globalState[GTKEY_KEYFRAMES];
}
