/**
 * OKHSL Plugin for Tasty
 *
 * Converts OKHSL color syntax to RGB notation.
 * Supports angle units: deg, turn, rad, or unitless (degrees).
 *
 * Examples:
 *   okhsl(240.5 50% 50%)
 *   okhsl(240.5deg 50% 50%)
 *   okhsl(0.25turn 50% 50%)
 *   okhsl(1.57rad 50% 50%)
 */

import { Lru } from '../parser/lru';
import { okhslToSrgb } from '../utils/color-math';

import type { StyleDetails } from '../parser/types';
import type { TastyPlugin, TastyPluginFactory } from './types';

const conversionCache = new Lru<string, string>(500);

const clamp = (value: number, min: number, max: number): number =>
  Math.max(Math.min(value, max), min);

/**
 * Parse an angle value with optional unit.
 * Supports: deg, turn, rad, or unitless (treated as degrees).
 */
const parseAngle = (value: string): number => {
  const match = value.match(/^([+-]?\d*\.?\d+)(deg|turn|rad)?$/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'turn':
      return num * 360;
    case 'rad':
      return (num * 180) / Math.PI;
    case 'deg':
    default:
      return num;
  }
};

/**
 * Parse a percentage value (e.g., "50%") to a 0-1 range.
 */
const parsePercentage = (value: string): number => {
  const match = value.match(/^([+-]?\d*\.?\d+)%?$/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  return value.includes('%') ? num / 100 : num;
};

/**
 * The okhsl function handler for tasty parser.
 * Receives parsed style groups and returns an RGB color string.
 */
const okhslFunc = (groups: StyleDetails[]): string => {
  if (groups.length === 0 || groups[0].all.length < 3) {
    console.warn('[okhsl] Expected 3 values (H S L), got:', groups);
    return 'rgb(0% 0% 0%)';
  }

  const group = groups[0];
  const tokens = group.all;

  const alpha =
    group.parts.length > 1 && group.parts[1].all.length > 0
      ? group.parts[1].output
      : undefined;

  const cacheKey = tokens.slice(0, 3).join(' ') + (alpha ? ` / ${alpha}` : '');
  const cached = conversionCache.get(cacheKey);
  if (cached) return cached;

  const h = parseAngle(tokens[0]);
  const s = parsePercentage(tokens[1]);
  const l = parsePercentage(tokens[2]);

  const [r, g, b] = okhslToSrgb(h, clamp(s, 0, 1), clamp(l, 0, 1));

  const format = (n: number): string => {
    const pct = n * 100;
    return parseFloat(pct.toFixed(1)).toString() + '%';
  };

  const result = alpha
    ? `rgb(${format(r)} ${format(g)} ${format(b)} / ${alpha})`
    : `rgb(${format(r)} ${format(g)} ${format(b)})`;

  conversionCache.set(cacheKey, result);
  return result;
};

/**
 * OKHSL Plugin for Tasty.
 *
 * Adds support for the `okhsl()` color function in tasty styles.
 *
 * @example
 * ```ts
 * import { configure } from '@tenphi/tasty';
 * import { okhslPlugin } from '@tenphi/tasty';
 *
 * configure({
 *   plugins: [okhslPlugin()],
 * });
 *
 * // Now you can use okhsl in styles:
 * const Box = tasty({
 *   styles: {
 *     fill: 'okhsl(240 50% 50%)',
 *   },
 * });
 * ```
 */
export const okhslPlugin: TastyPluginFactory = (): TastyPlugin => ({
  name: 'okhsl',
  funcs: {
    okhsl: okhslFunc,
  },
});

export { okhslFunc };
