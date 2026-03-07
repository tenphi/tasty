/**
 * Properties Utilities
 *
 * Utilities for extracting and processing CSS @property definitions in styles.
 * Unlike keyframes, properties are permanent once registered and don't need cleanup.
 *
 * Property names use tasty token syntax:
 * - `$name` for regular properties → `--name`
 * - `#name` for color properties → `--name-color` (auto-sets syntax: '<color>')
 */

import type { PropertyDefinition } from '../injector/types';
import { COLOR_FUNCS, RE_HEX, RE_NUMBER, RE_RAW_UNIT } from '../parser/const';
import type { Styles } from '../styles/types';
import { getRgbValuesFromRgbaString, strToRgb } from '../utils/styles';

// ============================================================================
// Constants
// ============================================================================

const PROPERTIES_KEY = '@properties';

/**
 * Valid CSS custom property name pattern (after the -- prefix).
 * Must start with a letter or underscore, followed by letters, digits, hyphens, or underscores.
 */
const VALID_PROPERTY_NAME_PATTERN = /^[a-z_][a-z0-9-_]*$/i;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a CSS custom property name (the part after --).
 * Returns true if the name is valid for use as a CSS custom property.
 */
export function isValidPropertyName(name: string): boolean {
  return VALID_PROPERTY_NAME_PATTERN.test(name);
}

/**
 * Result of parsing a property token.
 */
export interface ParsedPropertyToken {
  /** The CSS custom property name (e.g., '--my-prop') */
  cssName: string;
  /** Whether this is a color property */
  isColor: boolean;
  /** Whether the token was valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Check if styles object has local @properties definition.
 * Fast path: single property lookup.
 */
export function hasLocalProperties(styles: Styles): boolean {
  return PROPERTIES_KEY in styles;
}

/**
 * Extract local @properties from styles object.
 * Returns null if no local properties (fast path).
 */
export function extractLocalProperties(
  styles: Styles,
): Record<string, PropertyDefinition> | null {
  const properties = styles[PROPERTIES_KEY];
  if (!properties || typeof properties !== 'object') {
    return null;
  }
  return properties as Record<string, PropertyDefinition>;
}

// ============================================================================
// Token Parsing Functions
// ============================================================================

/**
 * Parse a property token name and return the CSS property name and whether it's a color.
 * Supports tasty token syntax and validates the property name.
 *
 * Token formats:
 * - `$name` → { cssName: '--name', isColor: false }
 * - `#name` → { cssName: '--name-color', isColor: true }
 * - `--name` → { cssName: '--name', isColor: false } (legacy, auto-detect color by suffix)
 * - `name` → { cssName: '--name', isColor: false } (legacy)
 *
 * @param token - The property token to parse
 * @returns Parsed result with cssName, isColor, isValid, and optional error
 */
export function parsePropertyToken(token: string): ParsedPropertyToken {
  if (!token || typeof token !== 'string') {
    return {
      cssName: '',
      isColor: false,
      isValid: false,
      error: 'Property token must be a non-empty string',
    };
  }

  let name: string;
  let isColor: boolean;

  if (token.startsWith('$')) {
    // Regular property token: $name → --name
    name = token.slice(1);
    isColor = false;
  } else if (token.startsWith('#')) {
    // Color property token: #name → --name-color
    name = token.slice(1);
    isColor = true;
  } else if (token.startsWith('--')) {
    // Legacy format with -- prefix
    name = token.slice(2);
    isColor = token.endsWith('-color');
  } else {
    // Legacy format without prefix
    name = token;
    isColor = token.endsWith('-color');
  }

  // Validate the name
  if (!name) {
    return {
      cssName: '',
      isColor,
      isValid: false,
      error: 'Property name cannot be empty',
    };
  }

  if (!isValidPropertyName(name)) {
    return {
      cssName: '',
      isColor,
      isValid: false,
      error: `Invalid property name "${name}". Must start with a letter or underscore, followed by letters, digits, hyphens, or underscores.`,
    };
  }

  // Build the CSS custom property name
  // For #name tokens, we add -color suffix
  // For legacy formats (--name-color or name-color), the name already includes -color
  let cssName: string;
  if (token.startsWith('#')) {
    // Color token: #name → --name-color
    cssName = `--${name}-color`;
  } else {
    // All other formats: just add -- prefix
    cssName = `--${name}`;
  }

  return {
    cssName,
    isColor,
    isValid: true,
  };
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize a property name to the CSS custom property format.
 *
 * @deprecated Use parsePropertyToken instead for proper token handling
 */
export function normalizePropertyName(name: string): string {
  const result = parsePropertyToken(name);
  return result.isValid ? result.cssName : `--${name}`;
}

/**
 * Normalize a property definition to a consistent string representation.
 * Used for comparing definitions to detect changes/conflicts.
 *
 * Keys are sorted alphabetically to ensure consistent comparison:
 * { inherits: true, syntax: '<color>' } === { syntax: '<color>', inherits: true }
 */
export function normalizePropertyDefinition(def: PropertyDefinition): string {
  const normalized: Record<string, unknown> = {};

  // Add properties in alphabetical order
  if (def.inherits !== undefined) {
    normalized.inherits = def.inherits;
  }
  if (def.initialValue !== undefined) {
    normalized.initialValue = String(def.initialValue);
  }
  if (def.syntax !== undefined) {
    normalized.syntax = def.syntax;
  }

  return JSON.stringify(normalized);
}

/**
 * Result of getEffectiveDefinition.
 */
export interface EffectiveDefinitionResult {
  /** The CSS custom property name */
  cssName: string;
  /** The effective property definition */
  definition: PropertyDefinition;
  /** Whether this is a color property */
  isColor: boolean;
  /** Whether the token was valid */
  isValid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Get the effective property definition for a token.
 * For color tokens (#name), auto-sets syntax to '<color>' and defaults initialValue to 'transparent'.
 *
 * @param token - Property token ($name, #name, --name, or plain name)
 * @param userDefinition - User-provided definition options
 * @returns Effective definition with cssName, definition, isValid, and optional error
 */
export function getEffectiveDefinition(
  token: string,
  userDefinition: PropertyDefinition,
): EffectiveDefinitionResult {
  const parsed = parsePropertyToken(token);

  if (!parsed.isValid) {
    return {
      cssName: '',
      definition: userDefinition,
      isColor: false,
      isValid: false,
      error: parsed.error,
    };
  }

  if (parsed.isColor) {
    // Color properties have fixed syntax and default initialValue
    return {
      cssName: parsed.cssName,
      definition: {
        syntax: '<color>', // Always '<color>' for color tokens, cannot be overridden
        inherits: userDefinition.inherits, // Allow inherits to be customized
        initialValue: userDefinition.initialValue ?? 'transparent', // Default to transparent
      },
      isColor: true,
      isValid: true,
    };
  }

  // Regular properties use the definition as-is
  return {
    cssName: parsed.cssName,
    definition: userDefinition,
    isColor: false,
    isValid: true,
  };
}

// ============================================================================
// Color RGB Companion Helpers
// ============================================================================

/**
 * Extract RGB triplet string from a color initial value.
 * Used when auto-creating the companion `-rgb` property for color @property definitions.
 *
 * @param initialValue - The color property's initial value (e.g., 'rgb(255 255 255)', 'transparent', '#fff')
 * @returns Space-separated RGB triplet (e.g., '255 255 255'), defaults to '0 0 0'
 */
export function colorInitialValueToRgb(initialValue?: string | number): string {
  if (initialValue == null) return '0 0 0';

  const str = String(initialValue).trim();
  if (!str || str === 'transparent') return '0 0 0';

  const rgba = strToRgb(str);
  if (rgba) {
    const values = getRgbValuesFromRgbaString(rgba);
    if (values.length >= 3) return values.slice(0, 3).join(' ');
  }

  return '0 0 0';
}

// ============================================================================
// Value Type Inference
// ============================================================================

const VAR_COLOR_PATTERN = /^var\(--[a-z0-9-]+-color/;

/**
 * Check whether a CSS value is a color.
 * Detects named CSS colors, hex values, color functions (rgb, hsl, oklch, etc.),
 * transparent, currentcolor, and var(--*-color) references.
 */
export function isColorValue(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;

  if (trimmed === 'transparent' || trimmed === 'currentcolor') return true;

  if (VAR_COLOR_PATTERN.test(trimmed)) return true;

  // Check for #hex values
  if (trimmed.startsWith('#') && RE_HEX.test(trimmed.slice(1))) return true;

  // Check for color functions: rgb(...), hsl(...), oklch(...), etc.
  const parenIdx = trimmed.indexOf('(');
  if (parenIdx > 0) {
    const fname = trimmed.slice(0, parenIdx);
    if (COLOR_FUNCS.has(fname)) return true;
  }

  // Check for named CSS colors via strToRgb
  const rgb = strToRgb(trimmed);
  return rgb != null;
}

/**
 * Result of inferring a CSS @property syntax from a value.
 */
export interface InferredSyntax {
  syntax: string;
  initialValue: string;
}

const UNIT_TO_SYNTAX: Record<string, InferredSyntax> = {};

const LENGTH_UNITS = [
  'px',
  'em',
  'rem',
  'vw',
  'vh',
  'vmin',
  'vmax',
  'ch',
  'ex',
  'cap',
  'ic',
  'lh',
  'rlh',
  'svw',
  'svh',
  'lvw',
  'lvh',
  'dvw',
  'dvh',
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
];

const ANGLE_UNITS = ['deg', 'rad', 'grad', 'turn'];
const TIME_UNITS = ['ms', 's'];

for (const u of LENGTH_UNITS) {
  UNIT_TO_SYNTAX[u] = { syntax: '<length>', initialValue: '0px' };
}
UNIT_TO_SYNTAX['%'] = { syntax: '<percentage>', initialValue: '0%' };
for (const u of ANGLE_UNITS) {
  UNIT_TO_SYNTAX[u] = { syntax: '<angle>', initialValue: '0deg' };
}
for (const u of TIME_UNITS) {
  UNIT_TO_SYNTAX[u] = { syntax: '<time>', initialValue: '0s' };
}

/**
 * Infer CSS @property syntax from a concrete value.
 * Inference is purely value-based; name-based checks (e.g. --*-color naming)
 * are handled by the validator in PropertyTypeResolver.
 *
 * @param value - The CSS value to infer from (e.g. '10px', '1', '45deg')
 * @param _propName - Unused, kept for API compatibility
 * @returns Inferred syntax and initial value, or null if not inferable
 */
export function inferSyntaxFromValue(
  value: string,
  _propName?: string,
): InferredSyntax | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Value-based color detection
  if (isColorValue(trimmed)) {
    return { syntax: '<color>', initialValue: 'transparent' };
  }

  // Bare number
  if (RE_NUMBER.test(trimmed)) {
    return { syntax: '<number>', initialValue: '0' };
  }

  // Number with unit
  const unitMatch = trimmed.match(RE_RAW_UNIT);
  if (unitMatch) {
    const unit = unitMatch[2];
    const mapping = UNIT_TO_SYNTAX[unit];
    if (mapping) return mapping;
  }

  return null;
}
