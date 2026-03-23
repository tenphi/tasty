import { StyleParser } from '../parser/parser';
import { okhslFunc } from '../plugins/okhsl-plugin';

import type { ProcessedStyle, StyleDetails } from '../parser/types';

import { getNamedColorHex } from './color-math';

export {
  getNamedColorHex,
  getRgbValuesFromRgbaString,
  hexToRgb,
  strToRgb,
} from './color-math';

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
const COLOR_VAR_COMPONENTS_PATTERN =
  /var\(--([a-z0-9-]+)-color-(?:rgb|hsl|oklch)/;
const RGB_ALPHA_PATTERN = /\/\s*([0-9.]+)\)/;
const RE_HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const RE_VAR_COLOR = /^var\(--[a-z0-9-]+-color/;

function isSimpleColorFast(val: string): boolean {
  const c0 = val.charCodeAt(0);

  switch (c0) {
    case 35: // '#'
      return RE_HEX_COLOR.test(val);
    case 114: // 'r'
      return val.charCodeAt(1) === 103 && val.charCodeAt(2) === 98; // 'rgb'
    case 104: // 'h'
      return val.charCodeAt(1) === 115 && val.charCodeAt(2) === 108; // 'hsl'
    case 108: // 'l'
      return val.charCodeAt(1) === 99 && val.charCodeAt(2) === 104; // 'lch'
    case 111: // 'o'
      return val.startsWith('oklch(') || val.startsWith('okhsl(');
    case 118: // 'v'
      return RE_VAR_COLOR.test(val);
    case 99: // 'c'
      return val === 'currentColor' || val === 'currentcolor';
    case 116: // 't'
      return val === 'transparent';
    default:
      return getNamedColorHex().has(val.toLowerCase());
  }
}

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
  const isSimpleColor = isSimpleColorFast(val);

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
        console.warn('Tasty: unable to parse color:', val);
        colorWarningCount++;
        if (colorWarningCount === MAX_COLOR_WARNINGS) {
          console.warn(
            'Tasty: color parsing warnings will be suppressed from now on',
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
    nameMatch = firstColor.match(COLOR_VAR_COMPONENTS_PATTERN);
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
