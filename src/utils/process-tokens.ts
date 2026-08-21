import type { Tokens, TokenValue } from '../types';

import type { CSSProperties } from './css-types';

import {
  convertColorChainToComponentChain,
  getColorSpaceComponents,
  getColorSpaceSuffix,
} from './color-space';
import { normalizeDslName } from './string';
import { normalizeColorTokenValue, parseStyle } from './styles';

export { hslToRgbValues } from './color-math';

const devMode = process.env.NODE_ENV !== 'production';

/**
 * Extract color components in the configured color space.
 * Returns a CSS variable reference for token colors, or decomposed
 * components as a space-separated string.
 */
function extractColorSpaceValue(
  colorValue: string,
  parsedOutput: string,
): string {
  // Try the parsed (replace-token-substituted) output first, then the raw
  // original. Using the parsed output ensures replaceTokens like `$hue` ->
  // `var(--hue)` are substituted before component extraction; the original is
  // only needed when the parser rewrote the value (e.g. okhsl -> rgb).
  const componentsFromParsed = getColorSpaceComponents(parsedOutput);
  if (componentsFromParsed !== parsedOutput) return componentsFromParsed;

  const components = getColorSpaceComponents(colorValue);
  if (components !== colorValue) return components;

  // Nothing decomposes as a whole, so rewrite it reference by reference: a
  // `var()` chain keeps its fallback order, and a color the engine cannot
  // evaluate — a `color-mix()`, a `light-dark()` — defers to the browser
  // through relative color syntax.
  const chain = convertColorChainToComponentChain(parsedOutput);
  if (chain !== parsedOutput) return chain;

  // Fallback: return the parsed output
  return parsedOutput;
}

/**
 * Check if a value is a valid token value (string, number, or boolean - not object).
 * Returns false for `false` values (they mean "skip this token").
 */
function isValidTokenValue(
  value: unknown,
): value is Exclude<TokenValue, undefined | null | false> {
  if (value === undefined || value === null || value === false) {
    return false;
  }

  if (typeof value === 'object') {
    if (devMode) {
      console.warn(
        '[Tasty] Object values are not allowed in tokens prop. ' +
          'Tokens do not support state-based styling. Use a primitive value instead.',
      );
    }
    return false;
  }

  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Process a single token value through the tasty parser.
 * Numbers are converted to strings; 0 stays as "0".
 */
function processTokenValue(value: string | number): string {
  if (typeof value === 'number') {
    // 0 should remain as "0", not converted to any unit
    if (value === 0) {
      return '0';
    }
    return parseStyle(String(value)).output;
  }
  return parseStyle(value).output;
}

/**
 * Process tokens object into inline style properties.
 * - $name -> --name with parsed value
 * - #name -> --name-color AND --name-color-{colorSpace} with parsed values
 *
 * @param tokens - The tokens object to process
 * @returns CSSProperties object or undefined if no tokens to process
 */
export function processTokens(
  tokens: Tokens | undefined,
): CSSProperties | undefined {
  if (!tokens) {
    return undefined;
  }

  const keys = Object.keys(tokens);
  if (keys.length === 0) {
    return undefined;
  }

  let result: Record<string, string> | undefined;

  for (const key of keys) {
    const value = tokens[key as keyof Tokens];

    // Skip undefined/null values
    if (!isValidTokenValue(value)) {
      continue;
    }

    if (key.startsWith('$')) {
      // Custom property token: $name -> --name
      const propName = `--${normalizeDslName(key.slice(1))}`;
      // Boolean true for custom properties converts to empty string (valid CSS value)
      const effectiveValue = value === true ? '' : value;
      const processedValue = processTokenValue(effectiveValue);

      if (!result) result = {};
      result[propName] = processedValue;
    } else if (key.startsWith('#')) {
      const colorName = normalizeDslName(key.slice(1));
      const suffix = getColorSpaceSuffix();

      // Normalize color token value (true → 'transparent', false is already filtered by isValidTokenValue)
      const effectiveValue = normalizeColorTokenValue(value);
      // Skip if normalized to null (shouldn't happen since false is filtered by isValidTokenValue)
      if (effectiveValue === null) continue;

      const originalValue =
        typeof effectiveValue === 'number'
          ? String(effectiveValue)
          : effectiveValue;
      const lowerValue = originalValue.toLowerCase();
      const processedValue = processTokenValue(effectiveValue);

      if (!result) result = {};
      result[`--${colorName}-color`] = processedValue;

      // Skip component generation for #current values (currentcolor is dynamic, cannot decompose)
      if (/^#current(?:\.|$)/i.test(lowerValue)) {
        continue;
      }

      result[`--${colorName}-color-${suffix}`] = extractColorSpaceValue(
        originalValue,
        processedValue,
      );
    }
  }

  return result as CSSProperties | undefined;
}
