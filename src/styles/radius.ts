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
    const dirMods = mods.filter((m) => DIRECTIONS.includes(m));

    if (!dirMods.length) {
      if (useLonghand) {
        return Object.fromEntries(
          RADIUS_LONGHANDS.map((prop) => [prop, keyword]),
        );
      }

      return { 'border-radius': keyword };
    }

    const result: Record<string, string> = {};
    const corners = new Set<number>();

    dirMods.forEach((dir) => {
      const i = DIRECTIONS.indexOf(dir);
      corners.add(i);
      corners.add((i + 1) % 4);
    });

    corners.forEach((i) => {
      result[RADIUS_LONGHANDS[i]] = keyword;
    });

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
    const arr = ['0', '0', '0', '0'];

    let flag = false;

    DIRECTIONS.forEach((dir, i) => {
      if (!mods.includes(dir)) return;

      flag = true;

      arr[i] = values[0] || PROP;
      arr[(i + 1) % 4] = values[0] || PROP;
    });

    if (flag) {
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
