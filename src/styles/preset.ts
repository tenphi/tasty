import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle, resolveCustomProperties } from '../utils/styles';
import { isTokenNameReference } from './shared';
import type { CSSMap } from '../utils/styles';

const PRESET_MODIFIERS = new Set([
  'strong',
  'bold',
  'italic',
  'icon',
  'tight',
  'normal',
]);

const SANS_FONT = 'var(--font-sans, var(--font-sans-fallback))';

/**
 * Convert a value to CSS, handling numbers as pixels for numeric properties
 */
function toCSS(
  value: string | number | undefined,
  isNumeric: boolean,
): string | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return isNumeric ? `${value}px` : String(value);
  }
  // Parse through style parser to handle custom units like 1x, 2r, etc.
  const processed = parseStyle(value);
  // A `$name-color` reference lands in the color bucket, not `values`, so the
  // fallback still has to substitute custom properties rather than emit the
  // raw DSL.
  return processed.groups[0]?.values[0] || resolveCustomProperties(value);
}

function setCSSValue(
  styles: CSSMap,
  styleName: string,
  presetName: string,
  mode?: 'var' | 'css',
) {
  let value = presetName;

  if (!CSS_WIDE_KEYWORDS.has(presetName)) {
    const fontSuffix = styleName === 'font-family' ? `, ${SANS_FONT}` : '';

    const defaultValue = `var(--default-${styleName}${fontSuffix})`;

    if (presetName === 'default') {
      value = `${defaultValue}${fontSuffix}`;
    } else {
      value = `var(--${presetName}-${styleName}, ${defaultValue})${fontSuffix}`;
    }
  }

  if (mode !== 'css') {
    styles[`--${styleName}`] = value;
  }

  if (mode !== 'var') {
    styles[styleName] = value;
  }
}

interface PresetStyleProps {
  preset?: string | boolean;
  fontSize?: string | number;
  lineHeight?: string | number;
  textTransform?: string;
  letterSpacing?: string | number;
  fontWeight?: string | number;
  fontStyle?: string | boolean;
  fontFamily?: string;
  /** Alias for fontFamily with special handling for 'monospace' and boolean */
  font?: string | boolean;
}

/**
 * Resolve font/fontFamily value to CSS font-family string.
 *
 * - `font="monospace"` → var(--font-mono, var(--font-mono-fallback))
 * - `font={true}` → var(--font-sans, var(--font-sans-fallback))
 * - `font="CustomFont"` → CustomFont, var(--font-sans, var(--font-sans-fallback))
 * - `fontFamily="Arial"` → Arial (direct, no fallback)
 */
function resolveFontFamily(
  font: string | boolean | undefined,
  fontFamily: string | undefined,
): string | null {
  // fontFamily takes precedence as a direct value
  if (fontFamily) {
    return resolveCustomProperties(fontFamily);
  }

  if (font == null || font === false) {
    return null;
  }

  if (font === 'monospace') {
    return 'var(--font-mono, var(--font-mono-fallback))';
  }

  if (font === true) {
    return SANS_FONT;
  }

  return `${resolveCustomProperties(font)}, ${SANS_FONT}`;
}

/**
 * Handles typography preset and individual font properties.
 *
 * Preset syntax uses `/` to separate the name from one or more
 * space-separated modifiers:
 * - `preset="h1"` — name only
 * - `preset="h2 / strong"` — name + modifier
 * - `preset="h2 / strong italic"` — name + multiple modifiers
 * - `preset="bold"` — modifier-only shorthand (name defaults to `inherit`)
 * - `preset="bold italic"` — modifier-only shorthand with multiple modifiers
 *
 * When `preset` is defined, it sets up CSS custom properties for typography.
 * Individual font props can be used with or without `preset`:
 * - With `preset`: overrides the preset value for that property
 * - Without `preset`: outputs the CSS directly
 *
 * Number values are converted to pixels for fontSize, lineHeight, letterSpacing.
 * fontWeight accepts numbers directly (e.g., 400, 700).
 *
 * font vs fontFamily:
 * - `font` is the recommended prop with special handling (monospace, boolean, fallback)
 * - `fontFamily` is a direct value without special handling
 */
export function presetStyle({
  preset,
  fontSize,
  lineHeight,
  textTransform,
  letterSpacing,
  fontWeight,
  fontStyle,
  fontFamily,
  font,
}: PresetStyleProps) {
  // A handler result, not an authoring styles object: every key written below is
  // a kebab-case CSS property or a `--custom-property`.
  const styles: CSSMap = {};
  const hasPreset = preset != null && preset !== false;

  // Handle preset if defined
  if (hasPreset) {
    const presetValue = preset === true ? '' : String(preset);

    const processed = parseStyle(presetValue);
    const group = processed.groups[0];
    const { parts } = group ?? { parts: [] };

    // parts[0] = preset name (or modifiers for shorthand like preset="bold italic")
    // parts[1] = optional space-separated modifiers after slash (e.g. "t3 / strong italic")
    const namePart = parts[0];
    const modPart = parts[1];

    const nameTokens = namePart?.all ?? [];
    // Mod-only shorthand: all tokens in parts[0] are recognized modifiers.
    const isModOnly =
      nameTokens.length > 0 && nameTokens.every((t) => PRESET_MODIFIERS.has(t));

    const nameToken = namePart?.mods[0] ?? namePart?.values[0] ?? '';
    // A reference cannot name a preset; fall back to `inherit`, the same name an
    // absent preset resolves to, rather than emitting `var(--var(--x)-font-size)`.
    const name =
      isModOnly || isTokenNameReference('preset', nameToken)
        ? 'inherit'
        : nameToken || 'inherit';

    const modTokens = isModOnly ? nameTokens : (modPart?.all ?? []);
    const isStrong = modTokens.includes('strong') || modTokens.includes('bold');
    const isItalic = modTokens.includes('italic');
    const isIcon = modTokens.includes('icon');
    const isTight = modTokens.includes('tight');
    const isNormal = modTokens.includes('normal');

    // Set preset values for properties not explicitly overridden
    if (fontSize == null) {
      setCSSValue(styles, 'font-size', name, 'css');
    }
    if (lineHeight == null) {
      setCSSValue(styles, 'line-height', name, 'css');
    }
    if (letterSpacing == null) {
      setCSSValue(styles, 'letter-spacing', name, 'css');
    }
    if (fontWeight == null) {
      setCSSValue(styles, 'font-weight', name, 'css');
    }
    if (fontStyle == null) {
      setCSSValue(styles, 'font-style', name, 'css');
    }
    if (textTransform == null) {
      setCSSValue(styles, 'text-transform', name, 'css');
    }
    if (fontFamily == null && font == null) {
      setCSSValue(styles, 'font-family', name, 'css');
    }

    setCSSValue(styles, 'bold-font-weight', name, 'var');
    setCSSValue(styles, 'icon-size', name, 'var');

    if (isStrong) {
      styles['font-weight'] = 'var(--bold-font-weight)';
    }
    if (isItalic) {
      styles['font-style'] = 'italic';
    }
    if (isIcon) {
      styles['font-size'] = 'var(--icon-size)';
      styles['line-height'] = 'var(--icon-size)';
    }
    if (isTight) {
      styles['line-height'] = '1em';
    }
    if (isNormal) {
      styles['line-height'] = 'normal';
    }
  }

  // Handle individual font properties (work with or without preset)
  const fontSizeVal = toCSS(fontSize, true);
  if (fontSizeVal) {
    styles['font-size'] = fontSizeVal;
  }

  const lineHeightVal = toCSS(lineHeight, true);
  if (lineHeightVal) {
    styles['line-height'] = lineHeightVal;
  }

  const letterSpacingVal = toCSS(letterSpacing, true);
  if (letterSpacingVal) {
    styles['letter-spacing'] = letterSpacingVal;
  }

  // fontWeight: numbers should NOT get 'px' suffix
  const fontWeightVal = toCSS(fontWeight, false);
  if (fontWeightVal) {
    styles['font-weight'] = fontWeightVal;
  }

  if (fontStyle != null) {
    if (fontStyle === true) {
      styles['font-style'] = 'italic';
    } else if (
      typeof fontStyle === 'string' &&
      CSS_WIDE_KEYWORDS.has(fontStyle)
    ) {
      styles['font-style'] = fontStyle;
    } else {
      styles['font-style'] = fontStyle ? 'italic' : 'normal';
    }
  }

  if (textTransform) {
    styles['text-transform'] = resolveCustomProperties(textTransform);
  }

  // Handle font/fontFamily (font has special handling, fontFamily is direct)
  const fontFamily_ = resolveFontFamily(font, fontFamily);
  if (fontFamily_) {
    styles['font-family'] = fontFamily_;
  }

  if (Object.keys(styles).length === 0) {
    return null;
  }

  return styles;
}

presetStyle.__lookupStyles = [
  'preset',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'fontWeight',
  'fontStyle',
  'fontFamily',
  'font',
];
