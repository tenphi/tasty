import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { makeEmptyDetails } from '../parser/types';
import { parseStyle } from '../utils/styles';
import { isUnset, resolveDefaultValue } from './shared';

/** `min` with no value; resolved through the parser so it follows the unit. */
const DEFAULT_MIN_SIZE = '1x';
const DEFAULT_MAX_SIZE = '100%';

/**
 * `stretch` as a fallback chain, emitted as one declaration per entry: engines
 * keep the last one they support, so the standard keyword goes last and the
 * prefixed forms cover engines that predate it.
 */
const STRETCH_FALLBACKS = [
  '-webkit-fill-available',
  '-moz-available',
  'stretch',
];

/**
 * Parse a dimension value (string, number, or boolean) into a CSS value
 */
function parseDimensionValue(
  val: string | number | boolean | undefined,
): string | null {
  if (isUnset(val)) return null;
  if (typeof val === 'number') return `${val}px`;
  if (val === true) return 'initial';

  const processed = parseStyle(String(val));
  return processed.groups[0]?.values[0] || null;
}

interface DimensionProps {
  value?: string | number | boolean;
  min?: string | number | boolean;
  max?: string | number | boolean;
}

/**
 * Creates a dimension style handler for a physical or logical size.
 *
 * Supports:
 * - Main dimension prop (width/height) with syntax for min/max
 * - Separate min/max props (minWidth/maxWidth or minHeight/maxHeight)
 *
 * Priority: Individual min/max props override values from main prop syntax
 */
export function dimensionStyle(
  name: 'width' | 'height' | 'block-size' | 'inline-size',
) {
  const minStyle = `min-${name}`;
  const maxStyle = `max-${name}`;

  return ({ value, min, max }: DimensionProps) => {
    if (isUnset(value) && isUnset(min) && isUnset(max)) return null;

    if (typeof value === 'string' && CSS_WIDE_KEYWORDS.has(value)) {
      const styles: Record<string, string> = {
        [name]: value,
        [minStyle]: value,
        [maxStyle]: value,
      };

      const minVal = parseDimensionValue(min);
      const maxVal = parseDimensionValue(max);
      if (minVal) styles[minStyle] = minVal;
      if (maxVal) styles[maxStyle] = maxVal;

      return styles;
    }

    if (value === true) {
      const styles: Record<string, string | string[]> = {
        [name]: 'auto',
        [minStyle]: 'initial',
        [maxStyle]: 'initial',
      };

      // Apply individual min/max overrides
      const minVal = parseDimensionValue(min);
      const maxVal = parseDimensionValue(max);
      if (minVal) styles[minStyle] = minVal;
      if (maxVal) styles[maxStyle] = maxVal;

      return styles;
    }

    const styles: Record<string, string | string[]> = {
      [name]: 'auto',
      [minStyle]: 'initial',
      [maxStyle]: 'initial',
    };

    // Process main dimension value
    if (!isUnset(value)) {
      let val = value;
      if (typeof val === 'number') {
        val = `${val}px`;
      }

      val = String(val);

      const processed = parseStyle(val);
      const { mods, values } = processed.groups[0] ?? makeEmptyDetails();

      let flag = false;

      for (const mod of mods) {
        switch (mod) {
          case 'min':
            styles[minStyle] =
              values[0] || resolveDefaultValue(DEFAULT_MIN_SIZE);
            flag = true;
            break;
          case 'max':
            styles[maxStyle] = values[0] || DEFAULT_MAX_SIZE;
            flag = true;
            break;
          case 'fixed': {
            // Fixed modifier: set all three dimensions to the same value
            const fixedValue = values[0] || 'max-content';
            styles[minStyle] = fixedValue;
            styles[name] = fixedValue;
            styles[maxStyle] = fixedValue;
            flag = true;
            break;
          }
          default:
            break;
        }
      }

      if (!flag || !mods.length) {
        if (values.length === 2) {
          styles[minStyle] = values[0];
          styles[maxStyle] = values[1];
        } else if (values.length === 3) {
          styles[minStyle] = values[0];
          styles[name] = values[1];
          styles[maxStyle] = values[2];
        } else {
          styles[name] = values[0] || 'auto';
        }
      }

      if (styles[name] === 'stretch') {
        styles[name] = STRETCH_FALLBACKS;
      }
    }

    // Apply individual min/max props (higher priority, override main prop syntax)
    const minVal = parseDimensionValue(min);
    const maxVal = parseDimensionValue(max);
    if (minVal) styles[minStyle] = minVal;
    if (maxVal) styles[maxStyle] = maxVal;

    return styles;
  };
}
