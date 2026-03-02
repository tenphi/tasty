import type { StyleDetails } from '../parser/types';
import { DIRECTIONS, filterMods, parseStyle } from '../utils/styles';

type Direction = (typeof DIRECTIONS)[number];

/**
 * Parse an inset value and return the first processed value
 */
function parseInsetValue(value: string | number | boolean): string | null {
  if (typeof value === 'number') return `${value}px`;
  if (!value) return null;
  if (value === true) value = '0';

  const { values } = parseStyle(value).groups[0] ?? { values: [] };

  return values[0] || '0';
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
    values: values.length ? values : ['0'],
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
 * Optimize inset output shorthand.
 */
function optimizeInset(dirs: Record<Direction, string>): { inset: string } {
  const { top, right, bottom, left } = dirs;
  if (top === right && right === bottom && bottom === left) {
    return { inset: top };
  }
  if (top === bottom && left === right) {
    return { inset: `${top} ${left}` };
  }
  return { inset: `${top} ${right} ${bottom} ${left}` };
}

/**
 * Inset style handler.
 *
 * IMPORTANT: This handler uses individual CSS properties (top, right, bottom, left)
 * when only individual direction props are specified. This allows CSS cascade to work
 * correctly when modifiers override only some directions.
 *
 * Example problem with using `inset` shorthand everywhere:
 *   styles: {
 *     top: { '': 0, 'side=bottom': 'initial' },
 *     right: { '': 0, 'side=left': 'initial' },
 *     bottom: { '': 0, 'side=top': 'initial' },
 *     left: { '': 0, 'side=right': 'initial' },
 *   }
 *
 * If we output `inset` for both cases:
 *   - Default: inset: 0 0 0 0
 *   - side=bottom: inset: initial auto auto auto  ← WRONG! Overrides all 4 directions
 *
 * With individual properties:
 *   - Default: top: 0; right: 0; bottom: 0; left: 0
 *   - side=bottom: top: initial  ← CORRECT! Only overrides top
 *
 * The `inset` shorthand is only used when the base `inset` prop is specified
 * OR when `insetBlock`/`insetInline` are used (which imply setting pairs).
 */
export function insetStyle({
  inset,
  insetBlock,
  insetInline,
  top,
  right,
  bottom,
  left,
}: {
  inset?: string | number | boolean;
  insetBlock?: string | number | boolean;
  insetInline?: string | number | boolean;
  top?: string | number | boolean;
  right?: string | number | boolean;
  bottom?: string | number | boolean;
  left?: string | number | boolean;
}) {
  if (
    inset == null &&
    insetBlock == null &&
    insetInline == null &&
    top == null &&
    right == null &&
    bottom == null &&
    left == null
  ) {
    return {};
  }

  // When only individual direction props are used (no inset, insetBlock, insetInline),
  // output individual CSS properties to allow proper CSS cascade with modifiers
  const onlyIndividualProps =
    inset == null && insetBlock == null && insetInline == null;

  if (onlyIndividualProps) {
    const result: Record<string, string> = {};

    if (top != null) {
      const val = parseInsetValue(top);
      if (val) result['top'] = val;
    }
    if (right != null) {
      const val = parseInsetValue(right);
      if (val) result['right'] = val;
    }
    if (bottom != null) {
      const val = parseInsetValue(bottom);
      if (val) result['bottom'] = val;
    }
    if (left != null) {
      const val = parseInsetValue(left);
      if (val) result['left'] = val;
    }

    return result;
  }

  const dirs: Record<Direction, string> = {
    top: 'auto',
    right: 'auto',
    bottom: 'auto',
    left: 'auto',
  };

  // Priority 1 (lowest): inset
  if (inset != null) {
    if (typeof inset === 'number') {
      const v = `${inset}px`;
      dirs.top = dirs.right = dirs.bottom = dirs.left = v;
    } else if (inset === true) {
      inset = '0';
    }

    if (typeof inset === 'string' && inset) {
      const processed = parseStyle(inset);
      const groups = processed.groups ?? [];

      for (const group of groups) {
        const { values, directions } = extractGroupData(group);
        applyGroup(dirs, values, directions);
      }
    }
  }

  // Priority 2 (medium): insetBlock/insetInline
  if (insetBlock != null) {
    const val = parseInsetValue(insetBlock);
    if (val) dirs.top = dirs.bottom = val;
  }
  if (insetInline != null) {
    const val = parseInsetValue(insetInline);
    if (val) dirs.left = dirs.right = val;
  }

  // Priority 3 (highest): individual directions
  if (top != null) {
    const val = parseInsetValue(top);
    if (val) dirs.top = val;
  }
  if (right != null) {
    const val = parseInsetValue(right);
    if (val) dirs.right = val;
  }
  if (bottom != null) {
    const val = parseInsetValue(bottom);
    if (val) dirs.bottom = val;
  }
  if (left != null) {
    const val = parseInsetValue(left);
    if (val) dirs.left = val;
  }

  return optimizeInset(dirs);
}

insetStyle.__lookupStyles = [
  'inset',
  'insetBlock',
  'insetInline',
  'top',
  'right',
  'bottom',
  'left',
];
