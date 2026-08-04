/**
 * Font Face Utilities
 *
 * Utilities for extracting and processing CSS @font-face definitions in styles.
 * Font-face rules are permanent once injected and do not need cleanup.
 */

import type { FontFaceDescriptors, FontFaceInput } from '../injector/types';
import type { Styles } from '../styles/types';

// ============================================================================
// Constants
// ============================================================================

const FONT_FACE_KEY = '@font-face';

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Check if styles object has local @font-face definition.
 */
export function hasLocalFontFace(styles: Styles): boolean {
  return FONT_FACE_KEY in styles;
}

/**
 * Extract local @font-face from styles object.
 * Returns null if no local font faces (fast path).
 */
export function extractLocalFontFace(
  styles: Styles,
): Record<string, FontFaceInput> | null {
  const fontFace = styles[FONT_FACE_KEY];
  if (!fontFace || typeof fontFace !== 'object') {
    return null;
  }
  return fontFace as Record<string, FontFaceInput>;
}

// ============================================================================
// CSS Formatting
// ============================================================================

const FONT_FACE_DESCRIPTOR_MAP: Record<string, string> = {
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  fontStretch: 'font-stretch',
  fontDisplay: 'font-display',
  unicodeRange: 'unicode-range',
  ascentOverride: 'ascent-override',
  descentOverride: 'descent-override',
  lineGapOverride: 'line-gap-override',
  sizeAdjust: 'size-adjust',
  fontFeatureSettings: 'font-feature-settings',
  fontVariationSettings: 'font-variation-settings',
};

/**
 * Format the inner declarations of a @font-face rule (no wrapper).
 * Used by the injector which needs selector and declarations separately.
 */
export function formatFontFaceDeclarations(
  family: string,
  descriptors: FontFaceDescriptors,
): string {
  const parts: string[] = [];

  parts.push(`font-family: "${family}";`);
  parts.push(`src: ${descriptors.src};`);

  for (const [key, cssName] of Object.entries(FONT_FACE_DESCRIPTOR_MAP)) {
    const value = descriptors[key as keyof FontFaceDescriptors];
    if (value !== undefined) {
      parts.push(`${cssName}: ${value};`);
    }
  }

  return parts.join(' ');
}

/**
 * Format a single @font-face rule as CSS.
 */
export function formatFontFaceRule(
  family: string,
  descriptors: FontFaceDescriptors,
): string {
  return `@font-face { ${formatFontFaceDeclarations(family, descriptors)} }`;
}

/**
 * Format all @font-face rules for a family (handles single or array form).
 * Returns an array of CSS strings, one per rule.
 */
export function formatFontFaceRules(
  family: string,
  input: FontFaceInput,
): string[] {
  const descriptors = Array.isArray(input) ? input : [input];
  return descriptors.map((desc) => formatFontFaceRule(family, desc));
}

/**
 * Generate a content hash for deduplication of a single font-face rule.
 */
export function fontFaceContentHash(
  family: string,
  descriptors: FontFaceDescriptors,
): string {
  return JSON.stringify({ family, ...descriptors });
}
