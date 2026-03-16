import type { TypographyPreset } from '../tokens/typography';

import type { Styles } from '../styles/types';

// Re-export types for convenience
export type { TypographyPreset };

/**
 * Generate typography tokens with $ prefix for CSS custom properties.
 *
 * Each preset generates the following CSS custom properties:
 * - `${name}-font-size`
 * - `${name}-line-height`
 * - `${name}-letter-spacing`
 * - `${name}-font-weight`
 * - `${name}-bold-font-weight` (if defined)
 * - `${name}-icon-size` (if defined)
 * - `${name}-text-transform` (if defined)
 * - `${name}-font-family` (if defined)
 * - `${name}-font-style` (if defined)
 *
 * @param presets - Typography presets object
 * @returns Styles object with $ prefixed keys
 *
 * @example
 * const customTokens = generateTypographyTokens({
 *   myHeading: { fontSize: '24px', lineHeight: '32px', fontWeight: '700' },
 *   body: { fontSize: '16px', lineHeight: '24px', fontWeight: '400' },
 * });
 */
export function generateTypographyTokens(
  presets: Record<string, TypographyPreset>,
): Styles {
  const tokens: Record<string, string | number> = {};

  for (const [name, preset] of Object.entries(presets)) {
    tokens[`$${name}-font-size`] = preset.fontSize;
    tokens[`$${name}-line-height`] = preset.lineHeight;
    tokens[`$${name}-letter-spacing`] = preset.letterSpacing ?? '0';
    tokens[`$${name}-font-weight`] = preset.fontWeight;

    if (preset.boldFontWeight !== undefined) {
      const boldKey =
        name === 'c1'
          ? `$${name}-font-bold-weight`
          : `$${name}-bold-font-weight`;
      tokens[boldKey] = preset.boldFontWeight;
    }

    if (preset.iconSize !== undefined) {
      tokens[`$${name}-icon-size`] = preset.iconSize;
    }

    if (preset.textTransform !== undefined) {
      tokens[`$${name}-text-transform`] = preset.textTransform;
    }

    if (preset.fontFamily !== undefined) {
      tokens[`$${name}-font-family`] = preset.fontFamily;
    }

    if (preset.fontStyle !== undefined) {
      tokens[`$${name}-font-style`] = preset.fontStyle;
    }
  }

  return tokens as Styles;
}
