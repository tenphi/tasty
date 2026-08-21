import { colorFuncName } from '../parser/const';
import {
  convertColorChainToComponentChain,
  getColorSpaceComponents,
  getColorSpaceSuffix,
  strToColorSpace,
} from '../utils/color-space';
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
        const suffix = getColorSpaceSuffix();

        const colorSpaceStr = strToColorSpace(styleValue as string);

        const { color, name } = parseColor(styleValue as string);

        if (name && colorSpaceStr) {
          return {
            [finalCssStyle]: `var(--${name}-color, ${colorSpaceStr})`,
            [`${finalCssStyle}-${suffix}`]: `var(--${name}-color-${suffix}, ${getColorSpaceComponents(
              colorSpaceStr,
            )})`,
          };
        } else if (name) {
          if (color) {
            return {
              [finalCssStyle]: color,
              [`${finalCssStyle}-${suffix}`]:
                convertColorChainToComponentChain(color),
            };
          }

          return {
            [finalCssStyle]: `var(--${name}-color)`,
            [`${finalCssStyle}-${suffix}`]: `var(--${name}-color-${suffix})`,
          };
        } else if (colorSpaceStr) {
          return {
            [finalCssStyle]: colorSpaceStr,
            [`${finalCssStyle}-${suffix}`]:
              getColorSpaceComponents(colorSpaceStr),
          };
        }

        // A color with no token name of its own — a `color-mix()`, a
        // `light-dark()`, any derived color function — still needs its
        // components companion, or `#name.alpha` on the token would compose
        // opacity onto nothing.
        if (color && colorFuncName(color)) {
          return {
            [finalCssStyle]: color,
            [`${finalCssStyle}-${suffix}`]:
              convertColorChainToComponentChain(color),
          };
        }

        return {
          [finalCssStyle]: color ?? '',
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
