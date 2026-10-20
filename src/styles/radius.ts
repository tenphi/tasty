import { makeEmptyDetails } from '../parser/types';
import { DIRECTIONS, parseStyle } from '../utils/styles';
import { extractCSSWideKeyword } from './shared';

const PROP = 'var(--radius)';
const SHARP = 'var(--sharp-radius)';

const RADIUS_LONGHANDS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
];

/**
 * Single-corner modifiers, indexed to match `RADIUS_LONGHANDS`.
 *
 * A directional modifier (`top`, `right`, …) addresses the corner *pair* along
 * that edge, so it cannot express one corner on its own. These name a corner
 * directly: `radius: 'top-right'` rounds only the top-right corner.
 */
const CORNERS = [
  'top-left',
  'top-right',
  'bottom-right',
  'bottom-left',
] as const;

/**
 * Corner indices (into `RADIUS_LONGHANDS`) addressed by the given modifiers.
 * Empty when no corner was named, so callers fall back to all corners.
 */
function cornerIndices(mods: string[]): number[] {
  const out = new Set<number>();

  DIRECTIONS.forEach((dir, i) => {
    if (!mods.includes(dir)) return;

    out.add(i);
    out.add((i + 1) % 4);
  });

  CORNERS.forEach((corner, i) => {
    if (mods.includes(corner)) out.add(i);
  });

  return [...out];
}

export function radiusStyle({
  radius,
}: {
  radius?: string | number | boolean;
}) {
  if (typeof radius === 'number') {
    radius = `${radius}px`;
  }

  if (!radius) return null;

  if (radius === true) radius = '1r';

  const processed = parseStyle(radius);
  const group = processed.groups[0] ?? makeEmptyDetails();
  const { mods } = group;
  let { values } = group;

  const keyword = extractCSSWideKeyword(group);

  const useLonghand = mods.includes('longhand');

  if (keyword) {
    const corners = cornerIndices(mods);

    if (!corners.length) {
      if (useLonghand) {
        return Object.fromEntries(
          RADIUS_LONGHANDS.map((prop) => [prop, keyword]),
        );
      }

      return { 'border-radius': keyword };
    }

    const result: Record<string, string> = {};

    for (const i of corners) {
      result[RADIUS_LONGHANDS[i]] = keyword;
    }

    return result;
  }

  if (mods.includes('round')) {
    values = ['9999rem'];
  } else if (mods.includes('ellipse')) {
    values = ['50%'];
  } else if (!values.length) {
    values = [PROP];
  }

  if (mods.includes('leaf')) {
    values = [
      values[1] || SHARP,
      values[0] || PROP,
      values[1] || SHARP,
      values[0] || PROP,
    ];
  } else if (mods.includes('backleaf')) {
    values = [
      values[0] || PROP,
      values[1] || SHARP,
      values[0] || PROP,
      values[1] || SHARP,
    ];
  } else if (mods.length) {
    const corners = cornerIndices(mods);

    if (corners.length) {
      const arr = ['0', '0', '0', '0'];

      for (const i of corners) {
        arr[i] = values[0] || PROP;
      }

      values = arr;
    }
  }

  if (useLonghand) {
    return {
      [RADIUS_LONGHANDS[0]]: values[0],
      [RADIUS_LONGHANDS[1]]: values[1] || values[0],
      [RADIUS_LONGHANDS[2]]: values[2] || values[0],
      [RADIUS_LONGHANDS[3]]: values[3] || values[1] || values[0],
    };
  }

  return {
    'border-radius': values.join(' '),
  };
}

radiusStyle.__lookupStyles = ['radius'];
