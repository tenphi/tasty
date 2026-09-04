/**
 * Generate data DOM attributes from modifier map.
 */
import type { AllBaseProps } from '../types';

import { Lru } from '../parser/lru';
import { camelToKebab } from './case-converter';

const cache = new Lru<string, Record<string, string>>();

export function modAttrs(
  map: AllBaseProps['mods'],
): Record<string, string> | null {
  if (!map) return null;

  const cacheKey = JSON.stringify(map);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const attrs: Record<string, string> = {};

  for (const key of Object.keys(map)) {
    const value = map[key];

    // Skip null, undefined, false
    if (value == null || value === false) continue;

    const attrName = `data-${camelToKebab(key)}`;

    if (value === true) {
      // Boolean true: data-{name}=""
      attrs[attrName] = '';
    } else if (typeof value === 'string') {
      // String value: data-{name}="value"
      attrs[attrName] = value;
    } else if (typeof value === 'number') {
      // Number: convert to string
      attrs[attrName] = String(value);
    } else if (process.env.NODE_ENV !== 'production') {
      // Reject other types (objects, arrays, functions)
      console.warn(
        `[Tasty] Invalid mod value for "${key}". Expected boolean, string, or number, got ${typeof value}`,
      );
    }
  }

  cache.set(cacheKey, attrs);
  return attrs;
}
