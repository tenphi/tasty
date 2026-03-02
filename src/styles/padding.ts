import type { StyleDetails } from '../parser/types';
import { DIRECTIONS, filterMods, parseStyle } from '../utils/styles';

type Direction = (typeof DIRECTIONS)[number];

/**
 * Parse a padding value and return the first processed value
 */
function parsePaddingValue(value: string | number | boolean): string | null {
  if (typeof value === 'number') return `${value}px`;
  if (!value) return null;
  if (value === true) value = '1x';

  const { values } = parseStyle(value).groups[0] ?? { values: [] };

  return values[0] || 'var(--gap)';
}

/**
 * Extract values and directions from a single parsed group.
 */
function extractGroupData(group: StyleDetails): {
  values: string[];
  directions: Direction[];
} {
  const { values = [], mods = [] } = group;
  return {
    values: values.length ? values : ['var(--gap)'],
    directions: filterMods(mods, DIRECTIONS) as Direction[],
  };
}

/**
 * Apply a single group's values and directions onto a direction map.
 */
function applyGroup(
  dirs: Record<Direction, string>,
  values: string[],
  directions: Direction[],
): void {
  if (!values.length) return;

  if (directions.length === 0) {
    dirs.top = values[0];
    dirs.right = values[1] || values[0];
    dirs.bottom = values[2] || values[0];
    dirs.left = values[3] || values[1] || values[0];
  } else {
    directions.forEach((dir, i) => {
      dirs[dir] = values[i] ?? values[0];
    });
  }
}

/**
 * Optimize padding output shorthand.
 */
function optimizePadding(dirs: Record<Direction, string>): {
  padding: string;
} {
  const { top, right, bottom, left } = dirs;
  if (top === right && right === bottom && bottom === left) {
    return { padding: top };
  }
  if (top === bottom && left === right) {
    return { padding: `${top} ${left}` };
  }
  return { padding: `${top} ${right} ${bottom} ${left}` };
}

export function paddingStyle({
  padding,
  paddingBlock,
  paddingInline,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
}: {
  padding?: string | number | boolean;
  paddingBlock?: string | number | boolean;
  paddingInline?: string | number | boolean;
  paddingTop?: string | number | boolean;
  paddingRight?: string | number | boolean;
  paddingBottom?: string | number | boolean;
  paddingLeft?: string | number | boolean;
}) {
  if (
    padding == null &&
    paddingBlock == null &&
    paddingInline == null &&
    paddingTop == null &&
    paddingRight == null &&
    paddingBottom == null &&
    paddingLeft == null
  ) {
    return {};
  }

  const dirs: Record<Direction, string> = {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
  };

  // Priority 1 (lowest): padding
  if (padding != null) {
    if (typeof padding === 'number') {
      const v = `${padding}px`;
      dirs.top = dirs.right = dirs.bottom = dirs.left = v;
    } else if (padding === true) {
      padding = '1x';
    }

    if (typeof padding === 'string' && padding) {
      const processed = parseStyle(padding);
      const groups = processed.groups ?? [];

      for (const group of groups) {
        const { values, directions } = extractGroupData(group);
        applyGroup(dirs, values, directions);
      }
    }
  }

  // Priority 2 (medium): paddingBlock/paddingInline
  if (paddingBlock != null) {
    const val = parsePaddingValue(paddingBlock);
    if (val) dirs.top = dirs.bottom = val;
  }
  if (paddingInline != null) {
    const val = parsePaddingValue(paddingInline);
    if (val) dirs.left = dirs.right = val;
  }

  // Priority 3 (highest): individual directions
  if (paddingTop != null) {
    const val = parsePaddingValue(paddingTop);
    if (val) dirs.top = val;
  }
  if (paddingRight != null) {
    const val = parsePaddingValue(paddingRight);
    if (val) dirs.right = val;
  }
  if (paddingBottom != null) {
    const val = parsePaddingValue(paddingBottom);
    if (val) dirs.bottom = val;
  }
  if (paddingLeft != null) {
    const val = parsePaddingValue(paddingLeft);
    if (val) dirs.left = val;
  }

  return optimizePadding(dirs);
}

paddingStyle.__lookupStyles = [
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
];
