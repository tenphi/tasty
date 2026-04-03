import { CSS_WIDE_KEYWORDS } from '../parser/const';
import type { StyleDetails } from '../parser/types';

/**
 * If the group contains exactly one value that is a CSS-wide keyword
 * and no colors, return the keyword. Otherwise null.
 *
 * Direction mods (top/right/bottom/left) may coexist with the keyword
 * for directional application like `padding="inherit top"`.
 */
export function extractCSSWideKeyword(group: StyleDetails): string | null {
  if (group.values.length !== 1 || group.colors.length > 0) return null;
  return CSS_WIDE_KEYWORDS.has(group.values[0]) ? group.values[0] : null;
}
