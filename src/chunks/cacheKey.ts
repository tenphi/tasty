/**
 * Chunk-specific cache key generation.
 *
 * Generates cache keys that only include styles relevant to a specific chunk,
 * enabling more granular caching and reuse.
 *
 * Enhanced to support predefined states:
 * - Global predefined states don't affect cache keys (constant across app)
 * - Local predefined states only affect cache keys if referenced in the chunk
 */

import {
  extractLocalPredefinedStates,
  extractPredefinedStateRefs,
} from '../states';
import type { Styles } from '../styles/types';
import { hasKeys } from '../utils/has-keys';

const _stableStringifyCache = new WeakMap<object, string>();

/**
 * Per-styles-object memo of the generated keys, keyed by chunk name.
 *
 * The key is derived purely from the styles object, the chunk name and the
 * chunk's style keys, so a styles object that survives across renders — the
 * common case for `tasty({ styles })` definitions — can skip the whole
 * serialization pass. `styleKeys` is verified rather than assumed, because
 * `categorizeStyleKeys` allocates a fresh array per call and callers are free
 * to pass their own.
 *
 * Like `_stableStringifyCache` and the local-predefined-states cache in
 * `../states`, this treats a styles object as immutable once it has been
 * handed to the engine. Mutating a styles object in place instead of creating
 * a new one was already unsupported.
 */
const _chunkKeyCache = new WeakMap<
  object,
  Map<string, { styleKeys: string[]; key: string }>
>();

/**
 * Recursively serialize a value with sorted keys for stable output.
 * This ensures that {a: 1, b: 2} and {b: 2, a: 1} produce the same string.
 * Uses a WeakMap cache for object values to avoid re-serializing the same references.
 */
function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }

  const cached = _stableStringifyCache.get(value as object);
  if (cached !== undefined) return cached;

  let result: string;
  if (Array.isArray(value)) {
    result = '[' + value.map(stableStringify).join(',') + ']';
  } else {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of sortedKeys) {
      if (obj[key] !== undefined) {
        parts.push(`${JSON.stringify(key)}:${stableStringify(obj[key])}`);
      }
    }
    result = '{' + parts.join(',') + '}';
  }

  _stableStringifyCache.set(value as object, result);
  return result;
}

function sameStyleKeys(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function computeChunkCacheKey(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
): string {
  // Extract local predefined states from the full styles object.
  // Cached by object identity in `../states`, so this is a lookup in the
  // steady state — and knowing up front whether any exist lets the loop below
  // skip building `chunkStylesStr`, which is only ever read when they do.
  const localStates = extractLocalPredefinedStates(styles);
  const hasLocalStates = hasKeys(localStates);

  // Start with chunk name for namespace separation
  const parts: string[] = [chunkName];

  // styleKeys are already sorted by categorizeStyleKeys
  let chunkStylesStr = '';

  for (const key of styleKeys) {
    const value = styles[key];
    if (value !== undefined) {
      // Use stable stringify for consistent serialization regardless of key order
      const serialized = stableStringify(value);
      parts.push(`${key}:${serialized}`);
      if (hasLocalStates) chunkStylesStr += serialized;
    }
  }

  // Only include local predefined states that are actually referenced in this chunk
  if (hasLocalStates) {
    const referencedStates = extractPredefinedStateRefs(chunkStylesStr);
    const relevantLocalStates: string[] = [];

    for (const stateName of referencedStates) {
      if (localStates[stateName]) {
        relevantLocalStates.push(`${stateName}=${localStates[stateName]}`);
      }
    }

    // Add relevant local states to the cache key (sorted for stability)
    if (relevantLocalStates.length > 0) {
      relevantLocalStates.sort();
      parts.unshift(`[states:${relevantLocalStates.join('|')}]`);
    }
  }

  // Use null character as separator (safe, not in JSON output)
  return parts.join('\0');
}

/**
 * Generate a cache key for a specific chunk.
 *
 * Only includes the styles that belong to this chunk, allowing
 * chunks to be cached independently.
 *
 * Also includes relevant local predefined states that are referenced
 * by this chunk's styles.
 *
 * The result is memoized on the identity of `styles`, so repeat renders of a
 * stable styles object pay a single Map lookup instead of re-serializing every
 * value just to decide that nothing changed.
 *
 * @param styles - The full styles object
 * @param chunkName - Name of the chunk
 * @param styleKeys - Keys of styles belonging to this chunk
 * @returns A stable cache key string
 */
export function generateChunkCacheKey(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
): string {
  let perStyles = _chunkKeyCache.get(styles as object);

  if (perStyles !== undefined) {
    const entry = perStyles.get(chunkName);
    if (entry !== undefined && sameStyleKeys(entry.styleKeys, styleKeys)) {
      return entry.key;
    }
  }

  const key = computeChunkCacheKey(styles, chunkName, styleKeys);

  if (perStyles === undefined) {
    perStyles = new Map();
    _chunkKeyCache.set(styles as object, perStyles);
  }
  perStyles.set(chunkName, { styleKeys, key });

  return key;
}
