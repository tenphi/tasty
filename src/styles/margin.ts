import type { StyleDetails } from '../parser/types';
import { DIRECTIONS, filterMods, parseStyle } from '../utils/styles';

type Direction = (typeof DIRECTIONS)[number];

/**
 * Parse a margin value and return the first processed value
 */
function parseMarginValue(value: string | number | boolean): string | null {
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
 * Optimize margin output shorthand.
 */
function optimizeMargin(dirs: Record<Direction, string>): {
  margin: string;
} {
  const { top, right, bottom, left } = dirs;
  if (top === right && right === bottom && bottom === left) {
    return { margin: top };
  }
  if (top === bottom && left === right) {
    return { margin: `${top} ${left}` };
  }
  return { margin: `${top} ${right} ${bottom} ${left}` };
}

export function marginStyle({
  margin,
  marginBlock,
  marginInline,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
}: {
  margin?: string | number | boolean;
  marginBlock?: string | number | boolean;
  marginInline?: string | number | boolean;
  marginTop?: string | number | boolean;
  marginRight?: string | number | boolean;
  marginBottom?: string | number | boolean;
  marginLeft?: string | number | boolean;
}) {
  if (
    margin == null &&
    marginBlock == null &&
    marginInline == null &&
    marginTop == null &&
    marginRight == null &&
    marginBottom == null &&
    marginLeft == null
  ) {
    return {};
  }

  const dirs: Record<Direction, string> = {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
  };

  // Priority 1 (lowest): margin
  if (margin != null) {
    if (typeof margin === 'number') {
      const v = `${margin}px`;
      dirs.top = dirs.right = dirs.bottom = dirs.left = v;
    } else if (margin === true) {
      margin = '1x';
    }

    if (typeof margin === 'string' && margin) {
      const processed = parseStyle(margin);
      const groups = processed.groups ?? [];

      for (const group of groups) {
        const { values, directions } = extractGroupData(group);
        applyGroup(dirs, values, directions);
      }
    }
  }

  // Priority 2 (medium): marginBlock/marginInline
  if (marginBlock != null) {
    const val = parseMarginValue(marginBlock);
    if (val) dirs.top = dirs.bottom = val;
  }
  if (marginInline != null) {
    const val = parseMarginValue(marginInline);
    if (val) dirs.left = dirs.right = val;
  }

  // Priority 3 (highest): individual directions
  if (marginTop != null) {
    const val = parseMarginValue(marginTop);
    if (val) dirs.top = val;
  }
  if (marginRight != null) {
    const val = parseMarginValue(marginRight);
    if (val) dirs.right = val;
  }
  if (marginBottom != null) {
    const val = parseMarginValue(marginBottom);
    if (val) dirs.bottom = val;
  }
  if (marginLeft != null) {
    const val = parseMarginValue(marginLeft);
    if (val) dirs.left = val;
  }

  return optimizeMargin(dirs);
}

marginStyle.__lookupStyles = [
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
];
