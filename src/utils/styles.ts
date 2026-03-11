import { StyleParser } from '../parser/parser';
import { okhslFunc } from '../plugins/okhsl-plugin';
import { createStateParserContext, parseAdvancedState } from '../states';
import type { Styles } from '../styles/types';

import { cacheWrapper } from './cache-wrapper';
import { camelToKebab } from './case-converter';
import { hslToRgb } from './hsl-to-rgb';
import { okhslToRgb } from './okhsl-to-rgb';

import type { ProcessedStyle, StyleDetails } from '../parser/types';
import type {
  AtRuleContext,
  ParsedAdvancedState,
  StateParserContext,
} from '../states';

export type StyleValue<T = string> = T | boolean | number | null | undefined;

/**
 * Normalize a color token value.
 * - Boolean `true` is converted to `'transparent'`
 * - Boolean `false` returns `null` (signals the token should be skipped)
 * - Other values are returned as-is
 *
 * @param value - The raw token value
 * @returns Normalized value or null if the token should be skipped
 */
export function normalizeColorTokenValue<T>(
  value: T | boolean,
): T | 'transparent' | null {
  if (value === true) {
    return 'transparent';
  }
  if (value === false) {
    return null;
  }
  return value as T;
}

export type StyleValueStateMap<T = string> = Record<
  string,
  StyleValue<T> | '@inherit'
>;

/**
 * Combined type for style values that can be either a direct value or a state map.
 * Use this for component props that accept style values.
 */
export type StylePropValue<T = string> = StyleValue<T> | StyleValueStateMap<T>;

export type ComputeModel = string | number;

export type CSSMap = { $?: string | string[] } & Record<
  string,
  string | string[]
>;

export type StyleHandlerResult = CSSMap | CSSMap[] | void;

export type RawStyleHandler = (value: StyleValueStateMap) => StyleHandlerResult;

export type StyleHandler = RawStyleHandler & {
  __lookupStyles: string[];
};

/**
 * Handler definition forms for configure() and plugins.
 * - Function only: lookup styles inferred from key name
 * - Single property tuple: ['styleName', handler]
 * - Multi-property tuple: [['style1', 'style2'], handler]
 */
export type StyleHandlerDefinition =
  | RawStyleHandler
  | [string, RawStyleHandler]
  | [string[], RawStyleHandler];

export interface StyleStateData {
  model?: ComputeModel;
  tokens?: string[];
  value: StyleValue | StyleValueStateMap | StyleStateData;
  /** The list of mods to apply */
  mods: string[];
  /** The list of **not** mods to apply (e.g. `:not(:hover)`) */
  notMods: string[];
  /** Advanced states (media queries, container queries, etc.) */
  advancedStates?: ParsedAdvancedState[];
  /** At-rule context for CSS generation */
  atRuleContext?: AtRuleContext;
  /** Own mods for sub-element states (from @own()) - applied to sub-element selector */
  ownMods?: string[];
  /** Negated own mods for sub-element states */
  negatedOwnMods?: string[];
}

export interface ParsedColor {
  color?: string;
  name?: string;
  opacity?: number;
}

export type StyleStateDataList = StyleStateData[];

export type StyleStateDataListMap = Record<string, StyleStateDataList>;

export type StyleMap = Record<string, StyleValue | StyleValueStateMap>;

export type StyleStateMap = Record<string, StyleStateData>;

const devMode = process.env.NODE_ENV !== 'production';

// Precompiled regex patterns for parseColor optimization
// Match var(--name-color...) and extract the name, regardless of fallbacks
const COLOR_VAR_PATTERN = /var\(--([a-z0-9-]+)-color/;
const COLOR_VAR_RGB_PATTERN = /var\(--([a-z0-9-]+)-color-rgb/;
const RGB_ALPHA_PATTERN = /\/\s*([0-9.]+)\)/;
const SIMPLE_COLOR_PATTERNS = [
  /^#[0-9a-fA-F]{3,8}$/, // Hex colors: #fff, #ffffff, #ffff, #ffffffff
  /^rgb\(/, // RGB/RGBA functions
  /^hsl\(/, // HSL/HSLA functions
  /^lch\(/, // LCH color functions
  /^oklch\(/, // OKLCH color functions
  /^okhsl\(/, // OKHSL color functions
  /^var\(--[a-z0-9-]+-color/, // CSS custom properties for colors
  /^currentColor$/, // CSS currentColor keyword
  /^transparent$/, // CSS transparent keyword
];

// Rate limiting for dev warnings to avoid spam
let colorWarningCount = 0;
const MAX_COLOR_WARNINGS = 10;

export const CUSTOM_UNITS = {
  r: '6px',
  cr: '10px',
  bw: '1px',
  ow: '3px',
  x: '8px',
  fs: 'var(--font-size)',
  lh: 'var(--line-height)',
  sf: function sf(num: number) {
    return `minmax(0, ${num}fr)`;
  },
};

export const DIRECTIONS = ['top', 'right', 'bottom', 'left'];

// Lazy-initialized to break the circular dependency:
// parser.ts → classify.ts → utils/styles.ts → parser.ts
let __tastyParser: StyleParser | null = null;

function getOrCreateParser(): StyleParser {
  if (!__tastyParser) {
    __tastyParser = new StyleParser({ units: CUSTOM_UNITS });
    __tastyParser.setFuncs(__tastyFuncs);
  }
  return __tastyParser;
}

// Registry for user-provided custom functions that the parser can call.
// It is updated through the `customFunc` helper exported below.
// okhsl is registered as a built-in function so it works regardless of
// tree-shaking or module initialization order.
const __tastyFuncs: Record<string, (groups: StyleDetails[]) => string> = {
  okhsl: okhslFunc,
};

export function customFunc(
  name: string,
  fn: (groups: StyleDetails[]) => string,
) {
  __tastyFuncs[name] = fn;
  getOrCreateParser().setFuncs(__tastyFuncs);
}

/**
 * Get the global StyleParser instance.
 * Used by configure() to apply parser configuration.
 */
export function getGlobalParser(): StyleParser {
  return getOrCreateParser();
}

/**
 * Get the current custom functions registry.
 * Used by configure() to merge with new functions.
 */
export function getGlobalFuncs(): Record<
  string,
  (groups: StyleDetails[]) => string
> {
  return __tastyFuncs;
}

// ============================================================================
// Global Predefined Tokens
// ============================================================================

/**
 * Storage for predefined tokens that are replaced during style parsing.
 * Keys are token names (with $ or # prefix), values are pre-processed CSS values.
 */
let __globalPredefinedTokens: Record<string, string> | null = null;

/**
 * Set global predefined tokens.
 * Called from configure() after processing token values.
 * Merges with existing tokens (new tokens override existing ones with same key).
 * Keys are normalized to lowercase (parser lowercases input before classification).
 * @internal
 */
export function setGlobalPredefinedTokens(
  tokens: Record<string, string>,
): void {
  // Normalize keys to lowercase for case-insensitive matching
  const normalizedTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    const lowerKey = key.toLowerCase();
    const lowerValue = value.toLowerCase();

    // Warn if trying to use bare #current to define other color tokens
    // #current represents currentcolor which cannot be used as a base for recursive token resolution
    // Note: #current.5 (with opacity) is allowed since it resolves to a concrete color-mix value
    if (lowerKey.startsWith('#') && lowerValue === '#current') {
      console.warn(
        `Tasty: Using #current to define color token "${key}" is not supported. ` +
          `The #current token represents currentcolor which cannot be used as a base for other tokens.`,
      );
      continue; // Skip this token
    }

    normalizedTokens[lowerKey] = value;
  }
  // Merge with existing tokens (consistent with how states, units, funcs are handled)
  __globalPredefinedTokens = __globalPredefinedTokens
    ? { ...__globalPredefinedTokens, ...normalizedTokens }
    : normalizedTokens;
  // Clear parser cache since token values affect parsing
  getOrCreateParser().clearCache();
}

/**
 * Get the current global predefined tokens.
 * Returns null if no tokens are configured.
 */
export function getGlobalPredefinedTokens(): Record<string, string> | null {
  return __globalPredefinedTokens;
}

/**
 * Reset global predefined tokens.
 * Used for testing.
 * @internal
 */
export function resetGlobalPredefinedTokens(): void {
  __globalPredefinedTokens = null;
  // Clear parser cache since token availability affects parsing
  getOrCreateParser().clearCache();
}

/**
 *
 * @param {String} value
 * @param {Number} mode
 * @returns {Object<String,String|Array>}
 */
export function parseStyle(value: StyleValue): ProcessedStyle {
  let str: string;

  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number') {
    str = String(value);
  } else {
    // boolean, null, undefined, objects etc. → empty string
    str = '';
  }

  return getOrCreateParser().process(str);
}

/**
 * Parse color. Find it value, name and opacity.
 * Optimized to avoid heavy parseStyle calls for simple color patterns.
 */
export function parseColor(val: string, ignoreError = false): ParsedColor {
  // Early return for non-strings or empty values
  if (typeof val !== 'string') {
    val = String(val ?? '');
  }

  val = val.trim();
  if (!val) return {};

  // Fast path: Check if it's a simple color pattern that doesn't need full parsing
  const isSimpleColor = SIMPLE_COLOR_PATTERNS.some((pattern) =>
    pattern.test(val),
  );

  let firstColor: string;
  if (isSimpleColor) {
    // For simple colors, use the value directly without parsing
    firstColor = val;
  } else {
    const processed = parseStyle(val);
    const extractedColor = processed.groups.find((g) => g.colors.length)
      ?.colors[0];

    if (!extractedColor) {
      // Rate-limited warning to avoid spam
      if (!ignoreError && devMode && colorWarningCount < MAX_COLOR_WARNINGS) {
        console.warn('CubeUIKit: unable to parse color:', val);
        colorWarningCount++;
        if (colorWarningCount === MAX_COLOR_WARNINGS) {
          console.warn(
            'CubeUIKit: color parsing warnings will be suppressed from now on',
          );
        }
      }
      return {};
    }

    firstColor = extractedColor;
  }

  // Extract color name (if present) from variable pattern using precompiled regex
  let nameMatch = firstColor.match(COLOR_VAR_PATTERN);
  if (!nameMatch) {
    nameMatch = firstColor.match(COLOR_VAR_RGB_PATTERN);
  }

  let opacity: number | undefined;
  if (
    firstColor.startsWith('rgb') ||
    firstColor.startsWith('hsl') ||
    firstColor.startsWith('lch') ||
    firstColor.startsWith('oklch') ||
    firstColor.startsWith('okhsl')
  ) {
    const alphaMatch = firstColor.match(RGB_ALPHA_PATTERN);
    if (alphaMatch) {
      const v = parseFloat(alphaMatch[1]);
      if (!isNaN(v)) opacity = v * 100;
    }
  }

  return {
    color: firstColor,
    name: nameMatch ? nameMatch[1] : undefined,
    opacity,
  };
}

/**
 * CSS named color keywords → hex values.
 * Lazy-initialized on first use to avoid up-front cost.
 */
let _namedColorHex: Map<string, string> | null = null;

function getNamedColorHex(): Map<string, string> {
  if (_namedColorHex) return _namedColorHex;
  _namedColorHex = new Map([
    ['aliceblue', '#f0f8ff'],
    ['antiquewhite', '#faebd7'],
    ['aqua', '#00ffff'],
    ['aquamarine', '#7fffd4'],
    ['azure', '#f0ffff'],
    ['beige', '#f5f5dc'],
    ['bisque', '#ffe4c4'],
    ['black', '#000000'],
    ['blanchedalmond', '#ffebcd'],
    ['blue', '#0000ff'],
    ['blueviolet', '#8a2be2'],
    ['brown', '#a52a2a'],
    ['burlywood', '#deb887'],
    ['cadetblue', '#5f9ea0'],
    ['chartreuse', '#7fff00'],
    ['chocolate', '#d2691e'],
    ['coral', '#ff7f50'],
    ['cornflowerblue', '#6495ed'],
    ['cornsilk', '#fff8dc'],
    ['crimson', '#dc143c'],
    ['cyan', '#00ffff'],
    ['darkblue', '#00008b'],
    ['darkcyan', '#008b8b'],
    ['darkgoldenrod', '#b8860b'],
    ['darkgray', '#a9a9a9'],
    ['darkgreen', '#006400'],
    ['darkgrey', '#a9a9a9'],
    ['darkkhaki', '#bdb76b'],
    ['darkmagenta', '#8b008b'],
    ['darkolivegreen', '#556b2f'],
    ['darkorange', '#ff8c00'],
    ['darkorchid', '#9932cc'],
    ['darkred', '#8b0000'],
    ['darksalmon', '#e9967a'],
    ['darkseagreen', '#8fbc8f'],
    ['darkslateblue', '#483d8b'],
    ['darkslategray', '#2f4f4f'],
    ['darkslategrey', '#2f4f4f'],
    ['darkturquoise', '#00ced1'],
    ['darkviolet', '#9400d3'],
    ['deeppink', '#ff1493'],
    ['deepskyblue', '#00bfff'],
    ['dimgray', '#696969'],
    ['dimgrey', '#696969'],
    ['dodgerblue', '#1e90ff'],
    ['firebrick', '#b22222'],
    ['floralwhite', '#fffaf0'],
    ['forestgreen', '#228b22'],
    ['fuchsia', '#ff00ff'],
    ['gainsboro', '#dcdcdc'],
    ['ghostwhite', '#f8f8ff'],
    ['gold', '#ffd700'],
    ['goldenrod', '#daa520'],
    ['gray', '#808080'],
    ['green', '#008000'],
    ['greenyellow', '#adff2f'],
    ['grey', '#808080'],
    ['honeydew', '#f0fff0'],
    ['hotpink', '#ff69b4'],
    ['indianred', '#cd5c5c'],
    ['indigo', '#4b0082'],
    ['ivory', '#fffff0'],
    ['khaki', '#f0e68c'],
    ['lavender', '#e6e6fa'],
    ['lavenderblush', '#fff0f5'],
    ['lawngreen', '#7cfc00'],
    ['lemonchiffon', '#fffacd'],
    ['lightblue', '#add8e6'],
    ['lightcoral', '#f08080'],
    ['lightcyan', '#e0ffff'],
    ['lightgoldenrodyellow', '#fafad2'],
    ['lightgray', '#d3d3d3'],
    ['lightgreen', '#90ee90'],
    ['lightgrey', '#d3d3d3'],
    ['lightpink', '#ffb6c1'],
    ['lightsalmon', '#ffa07a'],
    ['lightseagreen', '#20b2aa'],
    ['lightskyblue', '#87cefa'],
    ['lightslategray', '#778899'],
    ['lightslategrey', '#778899'],
    ['lightsteelblue', '#b0c4de'],
    ['lightyellow', '#ffffe0'],
    ['lime', '#00ff00'],
    ['limegreen', '#32cd32'],
    ['linen', '#faf0e6'],
    ['magenta', '#ff00ff'],
    ['maroon', '#800000'],
    ['mediumaquamarine', '#66cdaa'],
    ['mediumblue', '#0000cd'],
    ['mediumorchid', '#ba55d3'],
    ['mediumpurple', '#9370db'],
    ['mediumseagreen', '#3cb371'],
    ['mediumslateblue', '#7b68ee'],
    ['mediumspringgreen', '#00fa9a'],
    ['mediumturquoise', '#48d1cc'],
    ['mediumvioletred', '#c71585'],
    ['midnightblue', '#191970'],
    ['mintcream', '#f5fffa'],
    ['mistyrose', '#ffe4e1'],
    ['moccasin', '#ffe4b5'],
    ['navajowhite', '#ffdead'],
    ['navy', '#000080'],
    ['oldlace', '#fdf5e6'],
    ['olive', '#808000'],
    ['olivedrab', '#6b8e23'],
    ['orange', '#ffa500'],
    ['orangered', '#ff4500'],
    ['orchid', '#da70d6'],
    ['palegoldenrod', '#eee8aa'],
    ['palegreen', '#98fb98'],
    ['paleturquoise', '#afeeee'],
    ['palevioletred', '#db7093'],
    ['papayawhip', '#ffefd5'],
    ['peachpuff', '#ffdab9'],
    ['peru', '#cd853f'],
    ['pink', '#ffc0cb'],
    ['plum', '#dda0dd'],
    ['powderblue', '#b0e0e6'],
    ['purple', '#800080'],
    ['rebeccapurple', '#663399'],
    ['red', '#ff0000'],
    ['rosybrown', '#bc8f8f'],
    ['royalblue', '#4169e1'],
    ['saddlebrown', '#8b4513'],
    ['salmon', '#fa8072'],
    ['sandybrown', '#f4a460'],
    ['seagreen', '#2e8b57'],
    ['seashell', '#fff5ee'],
    ['sienna', '#a0522d'],
    ['silver', '#c0c0c0'],
    ['skyblue', '#87ceeb'],
    ['slateblue', '#6a5acd'],
    ['slategray', '#708090'],
    ['slategrey', '#708090'],
    ['snow', '#fffafa'],
    ['springgreen', '#00ff7f'],
    ['steelblue', '#4682b4'],
    ['tan', '#d2b48c'],
    ['teal', '#008080'],
    ['thistle', '#d8bfd8'],
    ['tomato', '#ff6347'],
    ['turquoise', '#40e0d0'],
    ['violet', '#ee82ee'],
    ['wheat', '#f5deb3'],
    ['white', '#ffffff'],
    ['whitesmoke', '#f5f5f5'],
    ['yellow', '#ffff00'],
    ['yellowgreen', '#9acd32'],
  ]);
  return _namedColorHex;
}

export function strToRgb(
  color: string,
  _ignoreAlpha = false,
): string | null | undefined {
  if (!color) return undefined;

  if (color.startsWith('rgb')) return color;

  if (color.startsWith('#')) return hexToRgb(color);

  if (color.startsWith('okhsl(')) return okhslToRgb(color);

  if (color.startsWith('hsl')) return hslToRgb(color);

  // Named CSS colors
  const namedHex = getNamedColorHex().get(color.toLowerCase());
  if (namedHex) return hexToRgb(namedHex);

  return null;
}

/**
 * Extract RGB values from an rgb()/rgba() string.
 * Supports all modern CSS syntax variations:
 * - Comma-separated: rgb(255, 128, 0)
 * - Space-separated: rgb(255 128 0)
 * - Fractional: rgb(128.5, 64.3, 32.1)
 * - Percentages: rgb(50%, 25%, 75%)
 * - Slash alpha notation: rgb(255 128 0 / 0.5)
 *
 * Returns array of RGB values (0-255 range), converting percentages as needed.
 */
export function getRgbValuesFromRgbaString(str: string): number[] {
  // Extract content inside rgb()/rgba()
  const match = str.match(/rgba?\(([^)]+)\)/i);
  if (!match) return [];

  const inner = match[1].trim();
  // Split by slash first (for alpha), then handle color components
  const [colorPart] = inner.split('/');
  // Split by comma or whitespace
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  return parts.slice(0, 3).map((part) => {
    part = part.trim();
    if (part.endsWith('%')) {
      // Convert percentage to 0-255 range
      return (parseFloat(part) / 100) * 255;
    }
    return parseFloat(part);
  });
}

export function hexToRgb(hex: string): string | null {
  const matched = hex
    .replace(
      /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
      (_m: string, r: string, g: string, b: string) =>
        '#' + r + r + g + g + b + b,
    )
    .substring(1)
    .match(/.{2}/g);

  if (!matched) return null;

  const rgba = matched.map(
    (x: string, i: number) => parseInt(x, 16) * (i === 3 ? 1 / 255 : 1),
  );

  if (rgba.some((v) => Number.isNaN(v))) {
    return null;
  }

  if (rgba.length >= 3) {
    return `rgb(${rgba.slice(0, 3).join(' ')}${rgba.length > 3 ? ` / ${rgba[3]}` : ''})`;
  }

  return null;
}

export function filterMods(mods: string[], allowedMods: string[]): string[] {
  return mods.filter((mod) => allowedMods.includes(mod));
}

export function extendStyles(
  defaultStyles?: Record<string, unknown> | null,
  newStyles?: Record<string, unknown> | null,
): Record<string, unknown> {
  let styles: Record<string, unknown> = {};

  if (!defaultStyles) {
    if (!newStyles) {
      return styles;
    }
  } else {
    styles = Object.assign({}, defaultStyles);
  }

  if (newStyles) {
    Object.keys(newStyles).forEach((key) => {
      if (newStyles[key] != null) {
        styles[key] = newStyles[key];
      }
    });
  }

  return styles;
}

/**
 * Split properties into style and non-style properties.
 * @param props - Component prop map.
 * @param [styleList] - List of all style properties.
 * @param [defaultStyles] - Default style map of the component.
 * @param [propMap] - Props to style alias map.
 * @param [ignoreList] - A list of properties to ignore.
 */
export function extractStyles(
  props: Record<string, unknown>,
  styleList: readonly string[] = [],
  defaultStyles?: Styles,
  propMap?: Record<string, string>,
  ignoreList: readonly string[] = [],
): Styles {
  const styles: Styles = {
    ...defaultStyles,
    ...(ignoreList.includes('styles')
      ? undefined
      : props.styles && typeof props.styles === 'object'
        ? (props.styles as Styles)
        : undefined),
  };

  Object.keys(props).forEach((prop) => {
    const propName = propMap ? propMap[prop] || prop : prop;
    const value = props[prop];

    if (ignoreList && ignoreList.includes(prop)) {
      // do nothing
    } else if (styleList.includes(propName)) {
      styles[propName] = value as Styles[keyof Styles];
    }
  }, {});

  return styles;
}

// Enhanced regex that includes advanced state patterns
// Matches: operators, parentheses, @media(...), @(...), @root(...), @own(...), @starting, @predefined,
//          value mods, boolean mods, pseudo-classes, classes, attribute selectors
const STATES_REGEXP =
  /([&|!^])|([()])|(@media:[a-z]+)|(@media\([^)]+\))|(@root\([^)]+\))|(@own\([^)]+\))|(@\([^)]+\))|(@starting)|(@[A-Za-z][A-Za-z0-9-]*)|([a-z][a-z0-9-]+=(?:"[^"]*"|'[^']*'|[^\s&|!^()]+))|([a-z][a-z0-9-]+)|(:[a-z][a-z0-9-]+\([^)]+\)|:[a-z][a-z0-9-]+)|(\.[a-z][a-z0-9-]+)|(\[[^\]]+])/gi;

/**
 * Check if a token is an advanced state (starts with @)
 */
export function isAdvancedStateToken(token: string): boolean {
  return token.startsWith('@') || token.startsWith('!@');
}
export const STATE_OPERATORS = {
  NOT: '!',
  AND: '&',
  OR: '|',
  XOR: '^',
};

export const STATE_OPERATOR_LIST = ['!', '&', '|', '^'];

/**
 * Convert state notation tokens to a compute model (string, or nested [op, lhs, rhs]).
 */
function convertTokensToComputeUnits(tokens: unknown[]): unknown {
  if (tokens.length === 1) {
    return tokens[0];
  }

  const hasLength = (x: unknown): x is string | unknown[] =>
    typeof x === 'string' || Array.isArray(x);

  STATE_OPERATOR_LIST.forEach((operator) => {
    let i;

    while ((i = tokens.indexOf(operator)) !== -1) {
      const token = tokens[i];

      if (token === '!') {
        const next = tokens[i + 1];
        if (next !== undefined && hasLength(next) && next.length !== 1) {
          tokens.splice(i, 2, ['!', next]);
        } else {
          tokens.splice(i, 1);
        }
      } else {
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        if (
          prev !== undefined &&
          next !== undefined &&
          hasLength(prev) &&
          hasLength(next) &&
          prev.length !== 1 &&
          next.length !== 1
        ) {
          tokens.splice(i - 1, 3, [token, prev, next]);
        } else {
          tokens.splice(i, 1);
        }
      }
    }
  });

  return tokens.length === 1 ? tokens[0] : tokens;
}

/**
 * Replace commas with | only outside of parentheses.
 * This preserves commas in advanced states like @(card, w < 600px)
 */
function replaceCommasOutsideParens(str: string): string {
  let result = '';
  let depth = 0;

  for (const char of str) {
    if (char === '(') {
      depth++;
      result += char;
    } else if (char === ')') {
      depth--;
      result += char;
    } else if (char === ',' && depth === 0) {
      // Only replace commas at the top level (outside parentheses)
      result += '|';
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Parse state notation and return tokens, modifiers and compute model.
 */
function parseStateNotationInner(
  notation: string,
  value: StyleValue | StyleValueStateMap | StyleStateData,
): StyleStateData {
  const tokens = replaceCommasOutsideParens(notation).match(STATES_REGEXP);

  if (!tokens || !tokens.length) {
    return {
      model: undefined,
      mods: [],
      notMods: [],
      tokens: [],
      value,
    };
  } else if (tokens.length === 1) {
    return {
      model: tokens[0],
      mods: tokens.slice(0),
      notMods: [],
      tokens,
      value,
    };
  }

  const mods: string[] = [];

  const operations: unknown[][] = [[]];
  let list = operations[0];
  let position = 0;
  let operation: unknown[];

  tokens.forEach((token) => {
    switch (token) {
      case '(':
        operation = [];
        position++;
        list = operations[position] = operation;
        break;
      case ')':
        position--;
        operations[position].push(
          convertTokensToComputeUnits(list as unknown[]),
        );
        list = operations[position];
        break;
      default:
        if (token.length > 1) {
          if (!mods.includes(token)) {
            mods.push(token);
          }
        }
        list.push(token);
    }
  });

  while (position) {
    position--;
    operations[position].push(convertTokensToComputeUnits(list as unknown[]));
    list = operations[position];
  }

  return {
    tokens,
    mods,
    notMods: [],
    model: convertTokensToComputeUnits(operations[0] as unknown[]) as
      | ComputeModel
      | undefined,
    value,
  };
}

export const parseStateNotation = cacheWrapper(parseStateNotationInner);

/**
 * Build an AtRuleContext from parsed advanced states
 */
export function buildAtRuleContext(
  advancedStates: ParsedAdvancedState[],
  negatedStates: Set<string>,
): AtRuleContext | undefined {
  if (advancedStates.length === 0) return undefined;

  const ctx: AtRuleContext = {};

  for (const state of advancedStates) {
    const isNegated = negatedStates.has(state.raw);

    switch (state.type) {
      case 'media': {
        if (!ctx.media) ctx.media = [];
        let mediaCondition = '';

        if (state.mediaType) {
          // @media:print, @media:screen, etc.
          mediaCondition = state.mediaType;
        } else if (state.condition) {
          // @media(width < 920px)
          mediaCondition = `(${state.condition})`;
        }

        if (mediaCondition) {
          if (isNegated) {
            ctx.media.push(`not ${mediaCondition}`);
          } else {
            ctx.media.push(mediaCondition);
          }
        }
        break;
      }

      case 'container': {
        if (!ctx.container) ctx.container = [];
        let condition = state.condition;
        if (isNegated) {
          condition = `not (${condition})`;
        }
        ctx.container.push({
          name: state.containerName,
          condition,
        });
        break;
      }

      case 'root': {
        if (!ctx.rootStates) ctx.rootStates = [];
        // Parse the condition to generate the proper selector
        const rootSelector = buildRootSelector(state.condition, isNegated);
        ctx.rootStates.push(rootSelector);
        break;
      }

      case 'starting': {
        if (!isNegated) {
          ctx.startingStyle = true;
        }
        break;
      }

      // 'own' and 'predefined' are handled differently (selector-based, not at-rule)
      // 'modifier' is a regular state
    }
  }

  // Return undefined if no at-rules were added
  if (
    !ctx.media?.length &&
    !ctx.container?.length &&
    !ctx.rootStates?.length &&
    !ctx.startingStyle
  ) {
    return undefined;
  }

  return ctx;
}

/**
 * Build a root state selector from a condition
 */
function buildRootSelector(condition: string, isNegated: boolean): string {
  // Handle different condition formats:
  // - theme=dark -> [data-theme="dark"]
  // - .className -> .className
  // - [attr] -> [attr]
  // - booleanMod -> [data-boolean-mod]

  let selector: string;

  if (condition.startsWith('.')) {
    // Class selector
    selector = condition;
  } else if (condition.startsWith('[')) {
    // Attribute selector
    selector = condition;
  } else if (condition.includes('=')) {
    // Value mod: theme=dark -> [data-theme="dark"]
    const [key, value] = condition.split('=');
    selector = `[data-${camelToKebab(key.trim())}="${value.trim()}"]`;
  } else {
    // Boolean mod: camelCase -> [data-camel-case]
    selector = `[data-${camelToKebab(condition)}]`;
  }

  if (isNegated) {
    return `:not(${selector})`;
  }
  return selector;
}

/**
 * Parse state notation and return tokens, modifiers and compute model.
 * Enhanced to detect and extract advanced states.
 */
export function styleStateMapToStyleStateDataList(
  styleStateMap: StyleStateMap | StyleValue | StyleValueStateMap,
  parserContext?: StateParserContext,
): { states: StyleStateDataList; mods: string[]; hasAdvancedStates: boolean } {
  if (typeof styleStateMap !== 'object' || !styleStateMap) {
    return {
      states: [
        {
          model: undefined,
          mods: [],
          notMods: [],
          value: styleStateMap,
        },
      ],
      mods: [],
      hasAdvancedStates: false,
    };
  }

  const stateDataList: StyleStateDataList = [];
  let hasAdvancedStates = false;

  Object.keys(styleStateMap).forEach((stateNotation) => {
    const state = parseStateNotation(
      stateNotation,
      styleStateMap[stateNotation],
    );

    // Check if this state contains any advanced states
    const advancedStates: ParsedAdvancedState[] = [];
    const negatedAdvancedStates = new Set<string>();
    const regularMods: string[] = [];
    const ownMods: string[] = [];
    const negatedOwnMods: string[] = [];

    // Scan tokens for advanced states
    if (state.tokens) {
      let isNegated = false;
      for (const token of state.tokens) {
        if (token === '!') {
          isNegated = true;
          continue;
        }

        if (isAdvancedStateToken(token)) {
          hasAdvancedStates = true;
          const ctx = parserContext || createStateParserContext(undefined);
          const parsed = parseAdvancedState(token, ctx);
          advancedStates.push(parsed);

          // Handle @own states specially - extract condition as ownMod
          if (parsed.type === 'own' && parsed.condition) {
            if (isNegated) {
              negatedOwnMods.push(parsed.condition);
            } else {
              ownMods.push(parsed.condition);
            }
          } else if (isNegated) {
            negatedAdvancedStates.add(token);
          }
          isNegated = false;
        } else if (
          token.length > 1 &&
          !['&', '|', '^', '(', ')'].includes(token)
        ) {
          regularMods.push(token);
          isNegated = false;
        } else {
          isNegated = false;
        }
      }
    }

    // If there are advanced states, build the atRuleContext
    if (advancedStates.length > 0) {
      state.advancedStates = advancedStates;
      state.atRuleContext = buildAtRuleContext(
        advancedStates,
        negatedAdvancedStates,
      );
      // Filter mods to only include regular mods (not advanced states)
      state.mods = regularMods;
    }

    // Store own mods for sub-element selector generation
    if (ownMods.length > 0) {
      state.ownMods = ownMods;
    }
    if (negatedOwnMods.length > 0) {
      state.negatedOwnMods = negatedOwnMods;
    }

    stateDataList.push(state);
  });

  stateDataList.reverse();

  let initialState;

  const allMods: string[] = stateDataList.reduce((all: string[], state) => {
    if (!state.mods.length && !state.advancedStates?.length) {
      initialState = state;
    } else {
      state.mods.forEach((mod) => {
        if (!all.includes(mod)) {
          all.push(mod);
        }
      });
    }

    return all;
  }, []);

  if (!initialState) {
    stateDataList.push({
      mods: [],
      notMods: allMods,
      value: true,
    });
  }

  return { states: stateDataList, mods: allMods, hasAdvancedStates };
}

export const COMPUTE_FUNC_MAP: Record<
  string,
  (a: unknown, b?: unknown) => unknown
> = {
  '!': (a: unknown) => !a,
  '^': (a: unknown, b?: unknown) => (a && !b) || (!a && b),
  '|': (a: unknown, b?: unknown) => a || b,
  '&': (a: unknown, b?: unknown) => a && b,
};

/**
 * Compute a result based on a model and incoming map.
 */
export function computeState(
  computeModel: ComputeModel,
  valueMap:
    | (number | boolean)[]
    | Record<string, boolean>
    | ((...args: unknown[]) => unknown),
) {
  if (!computeModel) return true;

  const map = valueMap as Record<string | number, unknown>;

  if (!Array.isArray(computeModel)) {
    if (typeof valueMap === 'function') {
      return !!valueMap(computeModel);
    } else {
      return !!map[computeModel];
    }
  }

  const func = COMPUTE_FUNC_MAP[computeModel[0]];

  if (!func) {
    console.warn(
      'CubeUIKit: unexpected compute method in the model',
      computeModel,
    );
    // return false;
  }

  let a: unknown = computeModel[1];

  if (typeof a === 'object') {
    a = !!computeState(a as unknown as ComputeModel, valueMap);
  } else if (typeof valueMap === 'function') {
    a = !!valueMap(a);
  } else {
    a = !!map[a as string | number];
  }

  if (computeModel.length === 2) {
    return func(a);
  }

  let b: unknown = computeModel[2];

  if (typeof b === 'object') {
    b = !!computeState(b as unknown as ComputeModel, valueMap);
  } else if (typeof valueMap === 'function') {
    b = !!valueMap(b);
  } else {
    b = !!map[b as string | number];
  }

  return !!func(a, b);
}

const _innerCache = new WeakMap();

export function stringifyStyles(styles: unknown): string {
  if (styles == null || typeof styles !== 'object') return '';
  const obj = styles as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol')
      continue;

    const c0 = k.charCodeAt(0);
    const needsInnerSort =
      ((c0 >= 65 && c0 <= 90) || c0 === 38) &&
      v &&
      typeof v === 'object' &&
      !Array.isArray(v);

    let sv: string;
    if (needsInnerSort) {
      sv = _innerCache.get(v);
      if (sv === undefined) {
        const innerObj = v as Record<string, unknown>;
        const innerKeys = Object.keys(innerObj).sort();
        const innerParts: string[] = [];
        for (const ik of innerKeys) {
          const ivs = JSON.stringify(innerObj[ik]);
          if (ivs !== undefined)
            innerParts.push(JSON.stringify(ik) + ':' + ivs);
        }
        sv = '{' + innerParts.join(',') + '}';
        _innerCache.set(v, sv);
      }
    } else {
      sv = JSON.stringify(v);
    }
    parts.push(JSON.stringify(k) + ':' + sv);
  }
  return '{' + parts.join(',') + '}';
}
