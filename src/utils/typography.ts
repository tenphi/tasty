import type { ConfigTokens } from '../styles/types';

const RESERVED_PRESET_NAMES = new Set([
  'strong',
  'bold',
  'italic',
  'icon',
  'tight',
]);

/**
 * Typography preset configuration.
 * Each preset defines font properties that get expanded into CSS custom properties.
 *
 * Use with `generateTypographyTokens()` to create typography tokens for your design system.
 */
export interface TypographyPreset {
  fontSize: string;
  lineHeight: string;
  letterSpacing?: string;
  fontWeight: string | number;
  boldFontWeight?: string | number;
  iconSize?: string;
  textTransform?: string;
  fontFamily?: string;
  fontStyle?: string;
}

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
 * @returns ConfigTokens object with $ prefixed keys
 *
 * @example
 * const customTokens = generateTypographyTokens({
 *   myHeading: { fontSize: '24px', lineHeight: '32px', fontWeight: '700' },
 *   body: { fontSize: '16px', lineHeight: '24px', fontWeight: '400' },
 * });
 */
export function generateTypographyTokens(
  presets: Record<string, TypographyPreset>,
): ConfigTokens {
  const tokens: Record<`$${string}`, string | number> = {};

  for (const [name, preset] of Object.entries(presets)) {
    if (RESERVED_PRESET_NAMES.has(name)) {
      throw new Error(
        `Invalid typography preset name "${name}". This name is reserved as a preset modifier.`,
      );
    }

    tokens[`$${name}-font-size`] = preset.fontSize;
    tokens[`$${name}-line-height`] = preset.lineHeight;
    tokens[`$${name}-letter-spacing`] = preset.letterSpacing ?? '0';
    tokens[`$${name}-font-weight`] = preset.fontWeight;

    if (preset.boldFontWeight !== undefined) {
      tokens[`$${name}-bold-font-weight`] = preset.boldFontWeight;
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

  return tokens as ConfigTokens;
}
