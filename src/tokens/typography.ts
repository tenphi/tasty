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
