import { StyleParser } from '../parser/parser';
import { okhslFunc } from '../plugins/okhsl-plugin';

import { hslToRgb } from './hsl-to-rgb';
import { okhslToRgb } from './okhsl-to-rgb';

import type { ProcessedStyle, StyleDetails } from '../parser/types';

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

export interface ParsedColor {
  color?: string;
  name?: string;
  opacity?: number;
}

export type StyleMap = Record<string, StyleValue | StyleValueStateMap>;

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

// ============================================================================
// Style Stringification
// ============================================================================

const _innerCache = new WeakMap();
const _topLevelCache = new WeakMap<object, string>();

export function stringifyStyles(styles: unknown): string {
  if (styles == null || typeof styles !== 'object') return '';

  const cached = _topLevelCache.get(styles as object);
  if (cached !== undefined) return cached;

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
  const result = '{' + parts.join(',') + '}';
  _topLevelCache.set(styles as object, result);
  return result;
}
