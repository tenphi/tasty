import type { StyleDetails } from '../parser/types';
import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle } from '../utils/styles';
import { extractCSSWideKeyword, warnExtraGroupValues } from './shared';

type Direction = 'top' | 'right' | 'bottom' | 'left';

const DIRECTION_TOP = 1;
const DIRECTION_RIGHT = 2;
const DIRECTION_BOTTOM = 4;
const DIRECTION_LEFT = 8;
const DIRECTION_MASK = 15;
const DIRECTION_LONGHAND = 16;
const DIRECTION_SPAN = 32;

export interface DirectionalConfig {
  /** CSS property name (e.g. 'padding', 'margin', 'inset', 'scroll-margin') */
  property: string;
  /** Default value when parsing yields empty (e.g. 'var(--gap)', '0') */
  defaultValue: string;
  /** Value used when the prop is `true` (e.g. '1x', '0') */
  trueValue: string;
  /** Default per-direction init value (e.g. '0', 'auto') */
  defaultInit: string;
  /**
   * When true, if only individual direction props are set (no shorthand),
   * output individual CSS properties instead of the shorthand. Needed by
   * inset for correct CSS cascade with modifiers.
   */
  individualOnly?: boolean;
  /**
   * Maps individual direction CSS property names. Defaults to
   * `${property}-top`, `${property}-right`, etc. For inset this is
   * `top`, `right`, `bottom`, `left`.
   */
  directionProperty?: (dir: Direction) => string;
  /**
   * Modifiers that expand the named side(s) to also cover the perpendicular
   * pair, so `inset: 'bottom dock'` pins the bottom edge and spans the full
   * width (`inset: auto 0 0 0`).
   *
   * Opt-in per property: only `inset` docks to an edge, so `padding`, `margin`
   * and `scrollMargin` ignore the modifier and treat it as an unknown mod.
   */
  spanModifiers?: readonly string[];
}

function parseSingleValue(
  val: string | number | boolean,
  defaultValue: string,
  trueValue: string,
): string | null {
  if (typeof val === 'number') return `${val}px`;
  if (!val) return null;
  if (val === true) val = trueValue;

  const strVal = String(val);

  if (CSS_WIDE_KEYWORDS.has(strVal)) return strVal;

  const { values } = parseStyle(strVal).groups[0] ?? { values: [] };

  return values[0] || defaultValue;
}

function directionModFlags(
  mods: string[],
  spanModifiers?: readonly string[],
): number {
  let flags = 0;

  for (const mod of mods) {
    if (mod === 'top') flags |= DIRECTION_TOP;
    else if (mod === 'right') flags |= DIRECTION_RIGHT;
    else if (mod === 'bottom') flags |= DIRECTION_BOTTOM;
    else if (mod === 'left') flags |= DIRECTION_LEFT;
    else if (mod === 'longhand') flags |= DIRECTION_LONGHAND;
  }

  if (spanModifiers) {
    for (const spanModifier of spanModifiers) {
      if (mods.includes(spanModifier)) {
        flags |= DIRECTION_SPAN;
        break;
      }
    }
  }

  return flags;
}

function applyGroup(
  dirs: Record<Direction, string>,
  group: StyleDetails,
  modFlags: number,
  property: string,
  defaultValue: string,
): void {
  const values = group.values.length ? group.values : [defaultValue];
  const directions = modFlags & DIRECTION_MASK;
  const span = modFlags & DIRECTION_SPAN;

  // A group that names directions carries one value — two with a span modifier.
  // Guarded inline so the valid path costs a single comparison.
  if (directions && values.length > (span ? 2 : 1)) {
    warnExtraGroupValues(property, group.input, span ? 2 : 1);
  }

  if (!directions) {
    // No direction named — plain CSS shorthand order (1-4 values). Unambiguous,
    // so it keeps working: `padding: '1x 2x'` is block 1x / inline 2x.
    dirs.top = values[0];
    dirs.right = values[1] || values[0];
    dirs.bottom = values[2] || values[0];
    dirs.left = values[3] || values[1] || values[0];

    return;
  }

  // A group that names directions has one meaningful value, applied to every
  // named direction: `padding: '2x top, 4x right'`, not `'2x 4x top right'`.
  // Extra values were reported above and are ignored here.
  const value = values[0];

  // Span first so an explicitly named direction always wins over the value it
  // would otherwise inherit as a perpendicular side.
  if (span) {
    // `inset: '2x 4x bottom dock'` pins the bottom at 2x and insets the spanned
    // sides by 4x. Without a second value the span reuses the edge's own value.
    const spanValue = values[1] ?? value;

    if (directions & DIRECTION_TOP) dirs.right = dirs.left = spanValue;
    if (directions & DIRECTION_RIGHT) dirs.top = dirs.bottom = spanValue;
    if (directions & DIRECTION_BOTTOM) dirs.right = dirs.left = spanValue;
    if (directions & DIRECTION_LEFT) dirs.top = dirs.bottom = spanValue;
  }

  if (directions & DIRECTION_TOP) dirs.top = value;
  if (directions & DIRECTION_RIGHT) dirs.right = value;
  if (directions & DIRECTION_BOTTOM) dirs.bottom = value;
  if (directions & DIRECTION_LEFT) dirs.left = value;
}

function optimizeShorthand(
  property: string,
  dirs: Record<Direction, string>,
): Record<string, string> {
  const { top, right, bottom, left } = dirs;

  if (top === right && right === bottom && bottom === left) {
    return { [property]: top };
  }
  if (top === bottom && left === right) {
    return { [property]: `${top} ${left}` };
  }

  return { [property]: `${top} ${right} ${bottom} ${left}` };
}

interface DirectionalProps {
  main?: string | number | boolean;
  top?: string | number | boolean;
  right?: string | number | boolean;
  bottom?: string | number | boolean;
  left?: string | number | boolean;
}

/**
 * Core directional style logic shared by padding, margin, inset, scrollMargin.
 */
export function processDirectionalStyle(
  config: DirectionalConfig,
  props: DirectionalProps,
): Record<string, string> | null {
  const { main, top, right, bottom, left } = props;

  if (
    main == null &&
    top == null &&
    right == null &&
    bottom == null &&
    left == null
  ) {
    return null;
  }

  const {
    property,
    defaultValue,
    trueValue,
    defaultInit,
    individualOnly,
    directionProperty,
    spanModifiers,
  } = config;
  const dirProp =
    directionProperty ?? ((dir: Direction) => `${property}-${dir}`);

  if (individualOnly) {
    const onlyIndividualProps = main == null;

    if (onlyIndividualProps) {
      const result: Record<string, string> = {};

      if (top != null) {
        const val = parseSingleValue(top, defaultValue, trueValue);
        if (val) result[dirProp('top')] = val;
      }
      if (right != null) {
        const val = parseSingleValue(right, defaultValue, trueValue);
        if (val) result[dirProp('right')] = val;
      }
      if (bottom != null) {
        const val = parseSingleValue(bottom, defaultValue, trueValue);
        if (val) result[dirProp('bottom')] = val;
      }
      if (left != null) {
        const val = parseSingleValue(left, defaultValue, trueValue);
        if (val) result[dirProp('left')] = val;
      }

      return Object.keys(result).length > 0 ? result : null;
    }
  }

  const dirs: Record<Direction, string> = {
    top: defaultInit,
    right: defaultInit,
    bottom: defaultInit,
    left: defaultInit,
  };

  let useLonghand = false;

  if (main != null) {
    if (typeof main === 'number') {
      const v = `${main}px`;
      dirs.top = dirs.right = dirs.bottom = dirs.left = v;
    } else {
      const strMain = main === true ? trueValue : String(main);

      if (strMain) {
        const keyword = CSS_WIDE_KEYWORDS.has(strMain) ? strMain : null;

        if (keyword) {
          dirs.top = dirs.right = dirs.bottom = dirs.left = keyword;
        } else {
          const processed = parseStyle(strMain);
          const groups = processed.groups ?? [];

          for (const group of groups) {
            const modFlags = directionModFlags(group.mods, spanModifiers);
            if (modFlags & DIRECTION_LONGHAND) useLonghand = true;

            const kw = extractCSSWideKeyword(group);

            if (kw) {
              const directions = modFlags & DIRECTION_MASK;

              if (!directions) {
                dirs.top = dirs.right = dirs.bottom = dirs.left = kw;
              } else {
                if (directions & DIRECTION_TOP) dirs.top = kw;
                if (directions & DIRECTION_RIGHT) dirs.right = kw;
                if (directions & DIRECTION_BOTTOM) dirs.bottom = kw;
                if (directions & DIRECTION_LEFT) dirs.left = kw;
              }
            } else {
              applyGroup(dirs, group, modFlags, property, defaultValue);
            }
          }
        }
      }
    }
  }

  if (top != null) {
    const val = parseSingleValue(top, defaultValue, trueValue);
    if (val) dirs.top = val;
  }
  if (right != null) {
    const val = parseSingleValue(right, defaultValue, trueValue);
    if (val) dirs.right = val;
  }
  if (bottom != null) {
    const val = parseSingleValue(bottom, defaultValue, trueValue);
    if (val) dirs.bottom = val;
  }
  if (left != null) {
    const val = parseSingleValue(left, defaultValue, trueValue);
    if (val) dirs.left = val;
  }

  if (useLonghand) {
    return {
      [dirProp('top')]: dirs.top,
      [dirProp('right')]: dirs.right,
      [dirProp('bottom')]: dirs.bottom,
      [dirProp('left')]: dirs.left,
    };
  }

  return optimizeShorthand(property, dirs);
}
