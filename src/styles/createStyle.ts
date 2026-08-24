import { strToColorSpace } from '../utils/color-space';
import { normalizeDslName, toSnakeCase } from '../utils/string';
import {
  normalizeColorTokenValue,
  parseColor,
  parseStyle,
} from '../utils/styles';
import type {
  CSSMap,
  StyleHandler,
  StyleValue,
  StyleValueStateMap,
} from '../utils/styles';

const CACHE: Record<string, StyleHandler> = {};

export function createStyle(
  styleName: string,
  cssStyle?: string,
  converter?: (styleValue: string | number | true) => string | undefined,
) {
  const key = `${styleName}.${cssStyle ?? ''}`;

  if (!CACHE[key]) {
    const styleHandler = (styleMap: StyleValueStateMap): CSSMap | null => {
      let styleValue = styleMap[styleName];

      if (styleValue == null || styleValue === false) return null;

      let finalCssStyle: string;
      const isColorToken =
        !cssStyle && typeof styleName === 'string' && styleName.startsWith('#');

      if (isColorToken) {
        finalCssStyle = `--${normalizeDslName(styleName.slice(1))}-color`;
      } else if (!cssStyle && styleName[0] === '$') {
        // A `$name` key names a custom property, so it keeps its case rather than
        // being kebab-cased — `$myVar` has to reach the same `--myVar` that
        // `$myVar` in a value references.
        finalCssStyle = `--${normalizeDslName(styleName.slice(1))}`;
      } else {
        finalCssStyle = cssStyle || toSnakeCase(styleName);
      }

      if (isColorToken) {
        const normalized = normalizeColorTokenValue(styleValue);
        if (normalized === null) return null;
        styleValue = normalized;
      }

      if (converter) {
        const converted = converter(styleValue as string | number | true);

        if (converted) {
          styleValue = converted;
        } else if (typeof styleValue !== 'string') {
          // A converter declining a non-string value leaves nothing to emit —
          // `true` and numbers have no meaningful CSS serialization on their
          // own. Strings are already valid CSS, so they pass through untouched.
          return null;
        }
      }

      if (
        typeof styleValue === 'string' &&
        finalCssStyle.startsWith('--') &&
        finalCssStyle.endsWith('-color')
      ) {
        styleValue = styleValue.trim();

        // A literal the engine can evaluate is emitted in the configured color
        // space. Everything else is whatever the parser resolved the value to —
        // a `#token` or fallback chain becomes its `var()` chain, a color
        // function keeps its expanded tokens, a keyword passes through.
        //
        // The two are mutually exclusive, so this is a precedence and not a
        // merge: a value `strToColorSpace` can convert is a literal, and a
        // literal never resolves to a `var(--name-color)` chain. Trying the
        // conversion first also keeps the heavier `parseColor` off the path for
        // plain literals — and off values it would warn about for no reason,
        // since it cannot resolve a bare CSS color name like `red`.
        const converted = strToColorSpace(styleValue as string);

        return {
          [finalCssStyle]:
            converted ?? parseColor(styleValue as string).color ?? '',
        };
      }

      const processed = parseStyle(styleValue as StyleValue);
      return { [finalCssStyle]: processed.output };
    };

    styleHandler.__lookupStyles = [styleName];

    CACHE[key] = styleHandler;
  }

  return CACHE[key];
}
