/**
 * Style chunk definitions for CSS chunking optimization.
 *
 * Styles are grouped into chunks based on:
 * 1. Handler dependencies - styles that share a handler MUST be in the same chunk
 * 2. Logical grouping - related styles grouped for better cache reuse
 *
 * See STYLE_CHUNKING_SPEC.md for detailed rationale.
 *
 * ============================================================================
 * ⚠️  CRITICAL ARCHITECTURAL CONSTRAINT: NO CROSS-CHUNK HANDLER DEPENDENCIES
 * ============================================================================
 *
 * Style handlers declare their dependencies via `__lookupStyles` array.
 * This creates a dependency graph where handlers read multiple style props.
 *
 * **ALL styles in a handler's `__lookupStyles` MUST be in the SAME chunk.**
 *
 * Why this matters:
 * 1. Each chunk computes a cache key from ONLY its own style values
 * 2. If a handler reads a style from another chunk, that value isn't in the cache key
 * 3. Changing the cross-chunk style won't invalidate this chunk's cache
 * 4. Result: stale CSS output or incorrect cache hits
 *
 * Example of a violation:
 * ```
 * // flowStyle.__lookupStyles = ['display', 'flow']
 * // If 'display' is in DISPLAY chunk and 'flow' is in LAYOUT chunk:
 * // - User sets { display: 'grid', flow: 'column' }
 * // - LAYOUT chunk caches CSS with flow=column, display=grid
 * // - User changes to { display: 'flex', flow: 'column' }
 * // - LAYOUT chunk cache key unchanged (only has 'flow')
 * // - Returns stale CSS computed with display=grid!
 * ```
 *
 * Before adding/moving styles, verify:
 * 1. Find all handlers that use this style (grep for the style name in __lookupStyles)
 * 2. Ensure ALL styles from each handler's __lookupStyles are in the same chunk
 *
 * For **custom** handlers registered through `configure({ handlers })` this is no
 * longer only a convention: `alignHandlerChunks()` in `styles/predefined.ts` pulls
 * any style name the lists below don't know into its handler's existing chunk, and
 * warns when a handler bridges two chunks defined here. The lists below are still
 * hand-maintained, so the constraint must be checked by hand when editing them.
 * ============================================================================
 */

import { isSelector } from '../utils/is-selector';

import { CHUNK_NAMES, STYLE_TO_CHUNK } from './style-chunk-map';
import type { ChunkName } from './style-chunk-map';

// ============================================================================
// Chunk Style Lists
// ============================================================================

// The chunk style lists and the style→chunk map live in `style-chunk-map.ts` so
// that the map is populated by importing *that* module, independent of whether
// this one has been loaded. Re-exported here for the original import paths.
export {
  APPEARANCE_CHUNK_STYLES,
  DIMENSION_CHUNK_STYLES,
  DISPLAY_CHUNK_STYLES,
  FONT_CHUNK_STYLES,
  LAYOUT_CHUNK_STYLES,
  POSITION_CHUNK_STYLES,
} from './style-chunk-map';
export { CHUNK_NAMES, STYLE_TO_CHUNK } from './style-chunk-map';
export type { ChunkName } from './style-chunk-map';

// ============================================================================
// Chunk Priority Order
// ============================================================================

/**
 * Chunk processing order. This ensures deterministic className allocation
 * regardless of style key order in the input.
 */
const CHUNK_ORDER: readonly string[] = [
  CHUNK_NAMES.APPEARANCE,
  CHUNK_NAMES.FONT,
  CHUNK_NAMES.DIMENSION,
  CHUNK_NAMES.DISPLAY,
  CHUNK_NAMES.LAYOUT,
  CHUNK_NAMES.POSITION,
  CHUNK_NAMES.MISC,
  CHUNK_NAMES.SUBCOMPONENTS,
] as const;

/**
 * Map from chunk name to its priority index for sorting.
 */
const _CHUNK_PRIORITY = new Map<string, number>(
  CHUNK_ORDER.map((name, index) => [name, index]),
);

// ============================================================================
// Chunk Info Interface
// ============================================================================

export interface ChunkInfo {
  /** Name of the chunk */
  name: ChunkName | string;
  /** Style keys belonging to this chunk */
  styleKeys: string[];
}

// ============================================================================
// Style Categorization
// ============================================================================

/**
 * Categorize style keys into chunks.
 *
 * Returns chunks in a deterministic order (by CHUNK_ORDER) regardless
 * of the order of keys in the input styles object.
 *
 * @param styles - The styles object to categorize
 * @returns Map of chunk name to array of style keys in that chunk (in priority order)
 */
export function categorizeStyleKeys(
  styles: Record<string, unknown>,
): Map<string, string[]> {
  // First pass: collect keys into chunks (unordered)
  const chunkData: Record<string, string[]> = {};
  const keys = Object.keys(styles);

  for (const key of keys) {
    // Skip the $ helper key (used for selector combinators)
    // Skip @keyframes and @property (processed separately in useStyles)
    // Skip recipe (resolved before pipeline by resolveRecipes)
    if (
      key === '$' ||
      key === '@keyframes' ||
      key === '@property' ||
      key === '@font-face' ||
      key === '@counter-style' ||
      key === '@function' ||
      key === 'recipe'
    ) {
      continue;
    }

    if (isSelector(key)) {
      // All selectors go into the subcomponents chunk
      if (!chunkData[CHUNK_NAMES.SUBCOMPONENTS]) {
        chunkData[CHUNK_NAMES.SUBCOMPONENTS] = [];
      }
      chunkData[CHUNK_NAMES.SUBCOMPONENTS].push(key);
    } else {
      // Look up the chunk for this style, default to misc
      const chunkName = STYLE_TO_CHUNK.get(key) ?? CHUNK_NAMES.MISC;
      if (!chunkData[chunkName]) {
        chunkData[chunkName] = [];
      }
      chunkData[chunkName].push(key);
    }
  }

  // Second pass: build ordered Map based on CHUNK_ORDER
  const orderedChunks = new Map<string, string[]>();

  // Add chunks in priority order
  for (const chunkName of CHUNK_ORDER) {
    if (chunkData[chunkName] && chunkData[chunkName].length > 0) {
      // Sort keys within chunk for consistent cache key generation
      orderedChunks.set(chunkName, chunkData[chunkName].sort());
    }
  }

  // Handle any unknown chunks (shouldn't happen, but be defensive)
  for (const chunkName of Object.keys(chunkData)) {
    if (!orderedChunks.has(chunkName)) {
      orderedChunks.set(chunkName, chunkData[chunkName].sort());
    }
  }

  return orderedChunks;
}
