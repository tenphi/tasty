import type { Tokens, TokenValue } from '../types';

import type { CSSProperties } from './css-types';

import { normalizeDslName } from './string';
import { normalizeColorTokenValue, parseStyle } from './styles';

export { hslToRgbValues } from './color-math';

const devMode = process.env.NODE_ENV !== 'production';

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
 * Resolve one `$name` / `#name` entry to the custom property it declares and
 * the value to declare, or `null` when the entry declares nothing.
 *
 * The two sigils differ only in the property name they build and in how `true`
 * is read: for a custom property it is the empty value, for a color it is
 * `transparent`.
 */
function resolveTokenEntry(
  key: string,
  value: Exclude<TokenValue, undefined | null | false>,
): [name: string, value: string] | null {
  const name = `--${normalizeDslName(key.slice(1))}`;

  if (key[0] === '$') {
    // Boolean true for custom properties converts to empty string (valid CSS value)
    return [name, processTokenValue(value === true ? '' : value)];
  }

  const colorValue = normalizeColorTokenValue(value);
  // Skip if normalized to null (shouldn't happen since false is filtered by isValidTokenValue)
  if (colorValue === null) return null;

  return [`${name}-color`, processTokenValue(colorValue)];
}

/**
 * Process tokens object into inline style properties.
 * - `$name` -> `--name` with the parsed value
 * - `#name` -> `--name-color` with the parsed value
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

    if (key[0] !== '$' && key[0] !== '#') continue;

    const entry = resolveTokenEntry(key, value);
    if (!entry) continue;

    if (!result) result = {};
    result[entry[0]] = entry[1];
  }

  return result as CSSProperties | undefined;
}
