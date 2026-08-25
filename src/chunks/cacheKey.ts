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

const _stableStringifyCache = new WeakMap<object, string>();

interface ChunkKeyEntry {
  /**
   * Flat `[key0, value0, key1, value1, …]` record of exactly what the key was
   * built from. Interleaving keeps an entry to one allocation.
   */
  snapshot: unknown[];
  key: string;
}

/**
 * Per-styles-object memo of generated keys, keyed by chunk name.
 *
 * Reading from this is free, so every call checks it. Writing to it is not:
 * the `WeakMap.set` plus the snapshot allocation measured ~35% of the cost of
 * generating a key from scratch, and it is pure waste for a styles object that
 * is never seen again. Callers therefore have to opt in via `reusable`, and
 * only for an object they know outlives the render that produced it.
 *
 * `Styles` is a plain mutable object, and nothing in the public
 * `computeStyles` / `useStyles` contract asks callers to freeze it, so a hit is
 * only returned after re-reading every value the key was built from and
 * confirming none of them changed. That check is deliberately shallow: it
 * compares the same references `stableStringify` would have looked up in
 * `_stableStringifyCache`, so a memoized key is stale in exactly the cases the
 * un-memoized function was already stale in — an object-valued style mutated
 * in place — and in no others.
 */
const _chunkKeyCache = new WeakMap<object, Map<string, ChunkKeyEntry>>();

/**
 * Is `entry` still a valid key for this chunk of `styles`?
 *
 * True only when the chunk asks for the same style keys, in the same order,
 * and every one of them still reads back the value the key was built from.
 */
function isEntryFresh(
  styles: Styles,
  entry: ChunkKeyEntry,
  styleKeys: string[],
): boolean {
  const snapshot = entry.snapshot;
  const length = styleKeys.length;

  if (snapshot.length !== length * 2) return false;

  for (let i = 0, at = 0; i < length; i++, at += 2) {
    const key = styleKeys[i];
    if (snapshot[at] !== key) return false;
    if (styles[key] !== snapshot[at + 1]) return false;
  }

  return true;
}

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

function computeChunkCacheKey(
  styles: Styles,
  chunkName: string,
  snapshot: unknown[],
): string {
  // Start with chunk name for namespace separation
  const parts: string[] = [chunkName];

  // styleKeys are already sorted by categorizeStyleKeys
  let chunkStylesStr = '';

  // Reading from the snapshot rather than from `styles` guarantees the key and
  // the values a memo entry validates against are the same values.
  for (let at = 0; at < snapshot.length; at += 2) {
    const value = snapshot[at + 1];
    if (value !== undefined) {
      // Use stable stringify for consistent serialization regardless of key order
      const serialized = stableStringify(value);
      parts.push(`${snapshot[at] as string}:${serialized}`);
      chunkStylesStr += serialized;
    }
  }

  // Extract local predefined states from the full styles object
  const localStates = extractLocalPredefinedStates(styles);

  // Only include local predefined states that are actually referenced in this chunk
  if (Object.keys(localStates).length > 0) {
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
 * @param styles - The full styles object
 * @param chunkName - Name of the chunk
 * @param styleKeys - Keys of styles belonging to this chunk
 * @param reusable - Pass `true` only when `styles` outlives this render and
 *   will be keyed again — a `tasty()` factory's own styles object, for
 *   instance. It stores the result so the next render can skip serializing
 *   every value again, which is worth doing only if there is a next render for
 *   this exact object. Freshly merged per-render objects must leave it `false`:
 *   storing them costs more than the key they would never reuse. Reading an
 *   existing entry does not require it.
 * @returns A stable cache key string
 */
export function generateChunkCacheKey(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
  reusable = false,
): string {
  let perStyles = _chunkKeyCache.get(styles as object);

  if (perStyles !== undefined) {
    const entry = perStyles.get(chunkName);
    if (entry !== undefined && isEntryFresh(styles, entry, styleKeys)) {
      return entry.key;
    }
  }

  const length = styleKeys.length;
  const snapshot: unknown[] = new Array(length * 2);

  for (let i = 0, at = 0; i < length; i++, at += 2) {
    const styleKey = styleKeys[i];
    snapshot[at] = styleKey;
    snapshot[at + 1] = styles[styleKey];
  }

  const key = computeChunkCacheKey(styles, chunkName, snapshot);

  if (reusable) {
    if (perStyles === undefined) {
      perStyles = new Map();
      _chunkKeyCache.set(styles as object, perStyles);
    }
    perStyles.set(chunkName, { snapshot, key });
  }

  return key;
}
