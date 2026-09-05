import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { DIRECTIONS, parseStyle } from '../utils/styles';
import { BORDER_STYLES } from './const';
import { assignLineSlots, extractCSSWideKeyword } from './shared';

type Direction = (typeof DIRECTIONS)[number];

interface GroupData {
  values: string[];
  mods: string[];
  colors: string[];
}

interface BorderValue {
  width: string;
  style: string;
  color: string;
}

interface ProcessedBorderGroup extends BorderValue {
  modFlags: number;
}

/**
 * Process a single group and return its directional flags and border value.
 */
function processGroup(group: GroupData): ProcessedBorderGroup {
  const { values, mods, colors } = group;
  let modFlags = 0;
  let lineStyle: string | undefined;

  for (const mod of mods) {
    if (mod === 'top') modFlags |= 1;
    else if (mod === 'right') modFlags |= 2;
    else if (mod === 'bottom') modFlags |= 4;
    else if (mod === 'left') modFlags |= 8;
    else if (mod === 'longhand') modFlags |= 16;
    else if (
      lineStyle === undefined &&
      (BORDER_STYLES as readonly string[]).includes(mod)
    ) {
      lineStyle = mod;
    }
  }

  const slots = assignLineSlots(values, lineStyle, colors[0]);

  const width = values[0] || 'var(--border-width)';
  const style = slots.style || 'solid';
  const color = slots.color || 'var(--border-color, currentColor)';

  return { modFlags, width, style, color };
}

/**
 * Format a border value to CSS string.
 */
function formatBorderValue(value: BorderValue): string {
  return `${value.width} ${value.style} ${value.color}`;
}

function expandBorder(value: string): Record<string, string> {
  const styles: Record<string, string> = {};

  for (const dir of DIRECTIONS) {
    styles[`border-${dir}`] = value;
  }

  return styles;
}

/** Parse one native border declaration without Tasty's physical-side modifiers. */
export function parseBorderValue(
  value: string | number | boolean,
): string | null {
  if (value === false) return null;
  if (value === true) value = '1bw';

  const stringValue =
    typeof value === 'number' ? `${value}px` : String(value).trim();

  if (!stringValue) return null;
  if (CSS_WIDE_KEYWORDS.has(stringValue)) return stringValue;

  const group = parseStyle(stringValue).groups[0];
  if (!group) return null;

  const keyword = extractCSSWideKeyword(group);
  if (keyword) return keyword;

  return formatBorderValue(processGroup(group));
}

/**
 * Border style handler with multi-group support.
 *
 * Single group (backward compatible):
 * - `border="1bw solid #red"` - all sides
 * - `border="1bw solid #red top left"` - only top and left
 *
 * Multi-group (new):
 * - `border="1bw #red, 2bw #blue top"` - all sides red 1bw, then top overridden to blue 2bw
 * - `border="1bw, dashed top bottom, #purple left right"` - base 1bw, dashed on top/bottom, purple on left/right
 *
 * Later groups override earlier groups for conflicting directions.
 */
export function borderStyle({
  border,
}: {
  border?: string | number | boolean;
}) {
  if (!border && border !== 0) return null;

  if (border === true) border = '1bw';

  const strBorder = String(border);

  if (CSS_WIDE_KEYWORDS.has(strBorder)) {
    return { border: strBorder };
  }

  const processed = parseStyle(strBorder);
  const groups = processed.groups;

  if (!groups.length) return null;

  // Single group - use original logic for backward compatibility
  if (groups.length === 1) {
    const group = groups[0];
    const keyword = extractCSSWideKeyword(group);

    if (keyword) {
      if (group.mods.includes('longhand')) {
        return expandBorder(keyword);
      }

      return { border: keyword };
    }

    const borderValue = processGroup(group);
    const { modFlags } = borderValue;
    const directionFlags = modFlags & 15;
    const useLonghand = modFlags & 16;

    const styleValue = formatBorderValue(borderValue);

    if (!directionFlags) {
      if (useLonghand) {
        return expandBorder(styleValue);
      }

      return { border: styleValue };
    }

    const zeroValue = `0 ${borderValue.style} ${borderValue.color}`;
    const styles: Record<string, string> = {};

    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      styles[`border-${dir}`] =
        directionFlags & (1 << i) ? styleValue : zeroValue;
    }

    return styles;
  }

  // Multi-group - process groups in order, later groups override earlier
  // Track whether any group specifies directions
  let hasAnyDirections = false;
  let useLonghand = false;

  // Build a map of direction -> border value. Missing entries have no border.
  const directionMap: Partial<Record<Direction, BorderValue>> = {};

  // Track the last "all directions" value for fallback
  let allDirectionsValue: BorderValue | null = null;

  // Process groups in order (first to last)
  for (const group of groups) {
    const borderValue = processGroup(group);
    const { modFlags } = borderValue;
    const directionFlags = modFlags & 15;
    if (modFlags & 16) useLonghand = true;

    if (!directionFlags) {
      // No specific directions - applies to all
      allDirectionsValue = borderValue;
      // Set all directions
      for (const dir of DIRECTIONS) {
        directionMap[dir] = borderValue;
      }
    } else {
      // Specific directions - override only those
      hasAnyDirections = true;
      for (let i = 0; i < DIRECTIONS.length; i++) {
        if (directionFlags & (1 << i)) {
          directionMap[DIRECTIONS[i]] = borderValue;
        }
      }
    }
  }

  // If no group specified any directions and we have an all-directions value,
  // return the simple `border` shorthand (or longhands if requested)
  if (!hasAnyDirections && allDirectionsValue) {
    const formatted = formatBorderValue(allDirectionsValue);

    if (useLonghand) {
      return expandBorder(formatted);
    }

    return { border: formatted };
  }

  // Otherwise, output individual border-* properties
  const result: Record<string, string> = {};
  const fallbackStyle = allDirectionsValue?.style || 'solid';
  const fallbackColor =
    allDirectionsValue?.color || 'var(--border-color, currentColor)';

  for (const dir of DIRECTIONS) {
    const value = directionMap[dir];
    if (value) {
      result[`border-${dir}`] = formatBorderValue(value);
    } else {
      // No border for this direction - set to 0
      // Use the last all-directions value for style/color consistency, or defaults
      result[`border-${dir}`] = `0 ${fallbackStyle} ${fallbackColor}`;
    }
  }

  return result;
}

borderStyle.__lookupStyles = ['border'];
