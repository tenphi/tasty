import type { StyleDetails } from '../parser/types';
import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { DIRECTIONS, filterMods, parseStyle } from '../utils/styles';
import { extractCSSWideKeyword } from './shared';

type Direction = (typeof DIRECTIONS)[number];

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
   * When true, if only individual direction props are set (no shorthand,
   * no block/inline), output individual CSS properties instead of the
   * shorthand. Needed by inset for correct CSS cascade with modifiers.
   */
  individualOnly?: boolean;
  /**
   * Maps individual direction CSS property names. Defaults to
   * `${property}-top`, `${property}-right`, etc. For inset this is
   * `top`, `right`, `bottom`, `left`.
   */
  directionProperty?: (dir: Direction) => string;
}

export function parseSingleValue(
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

function extractGroupData(
  group: StyleDetails,
  defaultValue: string,
): {
  values: string[];
  directions: Direction[];
} {
  const { values = [], mods = [] } = group;

  return {
    values: values.length ? values : [defaultValue],
    directions: filterMods(mods, DIRECTIONS) as Direction[],
  };
}

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

export interface DirectionalProps {
  main?: string | number | boolean;
  block?: string | number | boolean;
  inline?: string | number | boolean;
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
  const { main, block, inline, top, right, bottom, left } = props;

  if (
    main == null &&
    block == null &&
    inline == null &&
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
  } = config;
  const dirProp =
    directionProperty ?? ((dir: Direction) => `${property}-${dir}`);

  if (individualOnly) {
    const onlyIndividualProps = main == null && block == null && inline == null;

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
            const kw = extractCSSWideKeyword(group);

            if (kw) {
              const groupDirs = filterMods(
                group.mods,
                DIRECTIONS,
              ) as Direction[];

              if (groupDirs.length === 0) {
                dirs.top = dirs.right = dirs.bottom = dirs.left = kw;
              } else {
                for (const dir of groupDirs) {
                  dirs[dir] = kw;
                }
              }
            } else {
              const { values, directions } = extractGroupData(
                group,
                defaultValue,
              );
              applyGroup(dirs, values, directions);
            }
          }
        }
      }
    }
  }

  if (block != null) {
    const val = parseSingleValue(block, defaultValue, trueValue);
    if (val) dirs.top = dirs.bottom = val;
  }
  if (inline != null) {
    const val = parseSingleValue(inline, defaultValue, trueValue);
    if (val) dirs.left = dirs.right = val;
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

  return optimizeShorthand(property, dirs);
}
