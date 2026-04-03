import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle } from '../utils/styles';

import type { Styles } from './types';

const PRESET_MODIFIERS = new Set(['strong', 'bold', 'italic', 'icon', 'tight']);

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
  const processed = parseStyle(String(value));
  return processed.groups[0]?.values[0] || String(value);
}

function setCSSValue(
  styles: Styles,
  styleName: string,
  presetName: string,
  { varOnly, cssOnly }: { varOnly?: boolean; cssOnly?: boolean } = {},
) {
  const value = (() => {
    if (CSS_WIDE_KEYWORDS.has(presetName)) {
      return presetName;
    }

    const defaultValue = `var(--default-${styleName}${
      styleName === 'font-family'
        ? ', var(--font-sans, var(--font-sans-fallback))'
        : ''
    })`;
    const fontSuffix =
      styleName === 'font-family'
        ? ', var(--font-sans, var(--font-sans-fallback))'
        : '';

    if (presetName === 'default') {
      return `${defaultValue}${fontSuffix}`;
    } else {
      return `var(--${presetName}-${styleName}, ${defaultValue})${fontSuffix}`;
    }
  })();

  if (!cssOnly) {
    styles[`--${styleName}`] = value;
  }

  if (!varOnly) {
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
    return fontFamily;
  }

  if (font == null || font === false) {
    return null;
  }

  if (font === 'monospace') {
    return 'var(--font-mono, var(--font-mono-fallback))';
  }

  if (font === true) {
    return 'var(--font-sans, var(--font-sans-fallback))';
  }

  return `${font}, var(--font-sans, var(--font-sans-fallback))`;
}

/**
 * Handles typography preset and individual font properties.
 *
 * Preset syntax uses `/` to separate name from modifier:
 * - `preset="h1"` — name only
 * - `preset="h2 / strong"` — name + modifier
 * - `preset="bold"` — modifier-only shorthand (name defaults to `inherit`)
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
  const styles: Styles = {};
  const hasPreset = preset != null && preset !== false;

  // Handle preset if defined
  if (hasPreset) {
    const presetValue = preset === true ? '' : String(preset);

    const processed = parseStyle(presetValue);
    const group = processed.groups[0];
    const { parts } = group ?? { parts: [] };

    // parts[0] = preset name (or a modifier for shorthand like preset="bold")
    // parts[1] = optional modifier after slash (e.g. "t3 / bold")
    const namePart = parts[0];
    const modPart = parts[1];

    const nameToken = namePart?.mods[0] ?? namePart?.values[0] ?? '';
    const isModOnly = PRESET_MODIFIERS.has(nameToken);

    const name = isModOnly ? 'inherit' : nameToken || 'inherit';
    const modifier = isModOnly ? nameToken : (modPart?.mods[0] ?? '');

    const isStrong = modifier === 'strong' || modifier === 'bold';
    const isItalic = modifier === 'italic';
    const isIcon = modifier === 'icon';
    const isTight = modifier === 'tight';

    // Set preset values for properties not explicitly overridden
    if (fontSize == null) {
      setCSSValue(styles, 'font-size', name, { cssOnly: true });
    }
    if (lineHeight == null) {
      setCSSValue(styles, 'line-height', name, { cssOnly: true });
    }
    if (letterSpacing == null) {
      setCSSValue(styles, 'letter-spacing', name, { cssOnly: true });
    }
    if (fontWeight == null) {
      setCSSValue(styles, 'font-weight', name, { cssOnly: true });
    }
    if (fontStyle == null) {
      setCSSValue(styles, 'font-style', name, { cssOnly: true });
    }
    if (textTransform == null) {
      setCSSValue(styles, 'text-transform', name, { cssOnly: true });
    }
    if (fontFamily == null && font == null) {
      setCSSValue(styles, 'font-family', name, { cssOnly: true });
    }

    setCSSValue(styles, 'bold-font-weight', name, { varOnly: true });
    setCSSValue(styles, 'icon-size', name, { varOnly: true });

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
    styles['text-transform'] = textTransform;
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
