import {
  getColorSpaceComponents,
  getColorSpaceSuffix,
  strToColorSpace,
} from '../utils/color-space';
import { toSnakeCase } from '../utils/string';
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

/**
 * Convert color fallback chain to component fallback chain.
 * Example: var(--primary-color, var(--secondary-color))
 *   → var(--primary-color-oklch, var(--secondary-color-oklch))
 */
export function convertColorChainToComponentChain(colorValue: string): string {
  const suffix = getColorSpaceSuffix();

  // Handle func(var(--name-color-{suffix}) / alpha) pattern.
  // When #name.opacity is parsed, the classifier produces e.g.
  // oklch(var(--name-color-oklch) / .opacity).
  // The component chain should be just the inner var() reference.
  const componentVarMatch = colorValue.match(
    /^(?:rgb|hsl|oklch)a?\(\s*(var\(--[a-z0-9-]+-color-(?:rgb|hsl|oklch)\))\s*\//,
  );
  if (componentVarMatch) {
    return componentVarMatch[1];
  }

  // Match var(--name-color, ...) pattern
  const varPattern = /var\(--([a-z0-9-]+)-color\s*(?:,\s*(.+))?\)/;
  const match = colorValue.match(varPattern);

  if (!match) {
    // Not a color variable — try to convert to components
    const components = getColorSpaceComponents(colorValue);
    if (components !== colorValue) return components;
    return colorValue;
  }

  const [, name, fallback] = match;

  if (!fallback) {
    return `var(--${name}-color-${suffix})`;
  }

  const processedFallback = convertColorChainToComponentChain(fallback.trim());
  return `var(--${name}-color-${suffix}, ${processedFallback})`;
}

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
        const raw = styleName.slice(1);
        const name = toSnakeCase(raw).replace(/^-+/, '');
        finalCssStyle = `--${name}-color`;
      } else {
        finalCssStyle = cssStyle || toSnakeCase(styleName).replace(/^\$/, '--');
      }

      if (isColorToken) {
        const normalized = normalizeColorTokenValue(styleValue);
        if (normalized === null) return null;
        styleValue = normalized;
      }

      if (converter && typeof styleValue !== 'string') {
        styleValue = converter(styleValue as string | number | true);

        if (!styleValue) return null;
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
