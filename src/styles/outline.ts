import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle, resolveCustomProperties } from '../utils/styles';
import { BORDER_STYLES } from './const';
import { assignLineSlots } from './shared';

interface OutlineStyleProps {
  outline?: string | boolean | number;
  outlineOffset?: string | number;
}

/**
 * Generates CSS for outline property with optional offset.
 *
 * Syntax:
 * - `outline="2px solid #red"` - outline only
 * - `outline="2px solid #red / 4px"` - outline with offset (slash separator)
 * - `outline="2px / 4px"` - width with offset (simpler form)
 * - `outline={true}` - default 1ow solid outline
 * - `outlineOffset="4px"` - offset as separate prop (can be combined with outline)
 *
 * Priority: slash syntax in outline takes precedence over outlineOffset prop
 *
 * @return CSS properties for outline and optionally outline-offset
 */
export function outlineStyle({ outline, outlineOffset }: OutlineStyleProps) {
  const result: Record<string, string> = {};

  // Handle outline (0 is valid - means no outline)
  if (outline != null && outline !== false) {
    if (typeof outline === 'string' && CSS_WIDE_KEYWORDS.has(outline)) {
      result.outline = outline;
    } else {
      let outlineValue: string | boolean | number = outline;
      if (outline === true) outlineValue = '1ow';
      if (outline === 0) outlineValue = '0';

      const processed = parseStyle(String(outlineValue));
      const group = processed.groups[0];

      if (group) {
        const { parts } = group;
        const outlinePart = parts[0] ?? { values: [], mods: [], colors: [] };
        const offsetPart = parts[1];
        let lineStyle: string | undefined;

        for (const mod of outlinePart.mods) {
          if ((BORDER_STYLES as readonly string[]).includes(mod)) {
            lineStyle = mod;
            break;
          }
        }

        const slots = assignLineSlots(
          outlinePart.values,
          lineStyle,
          outlinePart.colors[0],
        );

        const value = outlinePart.values[0] || 'var(--outline-width)';
        const type = slots.style || 'solid';
        const outlineColor = slots.color || 'var(--outline-color)';

        result.outline = `${value} ${type} ${outlineColor}`;

        if (offsetPart?.values[0]) {
          result['outline-offset'] = offsetPart.values[0];
        }
      }
    }
  }

  // Handle outlineOffset prop (only if not already set by slash syntax)
  if (outlineOffset != null && result['outline-offset'] === undefined) {
    const offsetValue =
      typeof outlineOffset === 'number' ? `${outlineOffset}px` : outlineOffset;
    const processed = parseStyle(offsetValue);
    result['outline-offset'] =
      processed.groups[0]?.values[0] || resolveCustomProperties(offsetValue);
  }

  return result.outline === undefined && result['outline-offset'] === undefined
    ? null
    : result;
}

outlineStyle.__lookupStyles = ['outline', 'outlineOffset'];
