import { Lru } from '../parser/lru';
import type { StyleDetails } from '../parser/types';

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
 * Creates a color function handler for the tasty parser.
 * @param name The name of the color space (e.g., 'okhsl', 'okhst')
 * @param channelLabel The label for the channels in warnings (e.g., 'H S L')
 * @param convert A function that converts the parsed H, C2, C3 values to sRGB [r, g, b] (0-1)
 */
export function createColorFunc(
  name: string,
  channelLabel: string,
  convert: (h: number, c2: number, c3: number) => [number, number, number],
): (groups: StyleDetails[]) => string {
  const conversionCache = new Lru<string, string>(500);

  return (groups: StyleDetails[]): string => {
    if (groups.length === 0 || groups[0].all.length < 3) {
      console.warn(
        `[${name}] Expected 3 values (${channelLabel}), got:`,
        groups,
      );
      return 'rgb(0% 0% 0%)';
    }

    const group = groups[0];
    const tokens = group.all;

    const alpha =
      group.parts.length > 1 && group.parts[1].all.length > 0
        ? group.parts[1].output
        : undefined;

    const cacheKey =
      tokens.slice(0, 3).join(' ') + (alpha ? ` / ${alpha}` : '');
    const cached = conversionCache.get(cacheKey);
    if (cached) return cached;

    const h = parseAngle(tokens[0]);
    const c2 = parsePercentage(tokens[1]);
    const c3 = parsePercentage(tokens[2]);

    const [r, g, b] = convert(h, clamp(c2, 0, 1), clamp(c3, 0, 1));

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
}
