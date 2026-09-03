import { Lru } from '../parser/lru';
import { isDevEnv } from '../utils/is-dev-env';
import { warnOnceDev } from '../utils/warnings';
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
 * Parse a percentage value (e.g., "50%") to a 0-1 range. A unitless number is
 * read as the factor it already looks like, so `okhsl(280 .8 .52)` and
 * `okhsl(280 80% 52%)` are the same color.
 */
const parsePercentage = (value: string): number => {
  const match = value.match(/^([+-]?\d*\.?\d+)%?$/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  return value.includes('%') ? num / 100 : num;
};

/**
 * Creates a color function handler for the tasty parser.
 *
 * A color function is a custom `functions` entry that converts its arguments
 * to an `rgb(...)` string (an already-supported color), so it needs no special
 * core integration — registering it as a parse function is enough.
 *
 * @param name The name of the color function (e.g., 'okhsl', 'okhst')
 * @param convert Converts the parsed first three channel values (after angle/
 *   percent normalization) to sRGB `[r, g, b]` in the 0-1 range
 * @param label Optional diagnostic label shown in dev warnings when the wrong
 *   number of arguments is supplied (e.g., 'H S L'). Has no effect on parsing
 *   or output.
 */
export function createColorFunc(
  name: string,
  convert: (h: number, c2: number, c3: number) => [number, number, number],
  label?: string,
): (groups: StyleDetails[]) => string {
  const conversionCache = new Lru<string, string>(500);
  const expected = label ? ` (${label})` : '';

  return (groups: StyleDetails[]): string => {
    if (groups.length === 0 || groups[0].all.length < 3) {
      if (isDevEnv()) {
        console.warn(
          `[Tasty] ${name}(): expected 3 values${expected}, got:`,
          groups,
        );
      }

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

    // A *unitless* channel above 1 cannot be a factor, so it is a missing `%`.
    // Clamping it quietly is the worst outcome: `okhsl(280 80 52)` renders as
    // white, which looks like a color rather than like a mistake.
    //
    // The raw token decides, not the parsed number: `150%` parses to `1.5`,
    // which is over-saturation that legitimately clamps, and warning about it
    // would also burn the dedup slot and silence a real `80` later. `1` itself
    // is a legitimate factor, so the comparison is strict.
    const misscaled = [tokens[1], tokens[2]].filter(
      (raw, i) => !raw.includes('%') && (i === 0 ? c2 : c3) > 1,
    );

    if (misscaled.length) {
      warnOnceDev(
        `${name}:percent-scale`,
        `${name}(): channels are factors (0-1) or percentages, so ` +
          `${misscaled.map((v) => `"${v}"`).join(' and ')} ` +
          `${misscaled.length > 1 ? 'clamp' : 'clamps'} to 1 — add the ` +
          `missing '%', or write the value as a 0-1 number.`,
      );
    }

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
