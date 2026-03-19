/**
 * Chunk-specific style rendering.
 *
 * Renders styles for a specific chunk by filtering the styles object
 * to only include relevant keys before passing to renderStyles.
 */

import type { RenderResult } from '../pipeline';
import { hasPipelineCacheEntry, renderStyles } from '../pipeline';
import { extractLocalPredefinedStates } from '../states';
import type { Styles } from '../styles/types';

import { CHUNK_NAMES } from './definitions';

/**
 * Build a filtered styles object for a regular chunk.
 */
function buildFilteredStyles(
  styles: Styles,
  styleKeys: string[],
): Styles {
  const localPredefinedStates = extractLocalPredefinedStates(styles);
  const filteredStyles: Styles = {};

  for (const [key, value] of Object.entries(localPredefinedStates)) {
    filteredStyles[key] = value;
  }

  for (const key of styleKeys) {
    const value = styles[key];
    if (value !== undefined) {
      filteredStyles[key] = value;
    }
  }

  return filteredStyles;
}

/**
 * Build a filtered styles object for the subcomponents chunk.
 */
function buildSubcomponentFilteredStyles(
  styles: Styles,
  selectorKeys: string[],
): Styles {
  const localPredefinedStates = extractLocalPredefinedStates(styles);
  const filteredStyles: Styles = {};

  for (const [key, value] of Object.entries(localPredefinedStates)) {
    filteredStyles[key] = value;
  }

  for (const key of selectorKeys) {
    const value = styles[key];
    if (value !== undefined) {
      filteredStyles[key] = value;
    }
  }

  if (styles.$ !== undefined) {
    filteredStyles.$ = styles.$;
  }

  return filteredStyles;
}

/**
 * Render styles for a specific chunk.
 *
 * On pipeline cache hit, avoids building the filtered styles object entirely.
 * Only constructs it on cache miss when the pipeline actually needs the styles.
 *
 * IMPORTANT: Local predefined states (e.g., '@mobile': '@media(w < 600px)')
 * are always included in the filtered styles, regardless of which chunk is
 * being rendered. This ensures that state references like '@mobile' in any
 * chunk can be properly resolved by the pipeline.
 *
 * @param styles - The full styles object
 * @param chunkName - Name of the chunk being rendered
 * @param styleKeys - Keys of styles belonging to this chunk
 * @returns RenderResult with rules for this chunk
 */
export function renderStylesForChunk(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
  pipelineCacheKey?: string,
): RenderResult {
  if (styleKeys.length === 0) {
    return { rules: [], className: '' };
  }

  // Fast path: skip building filteredStyles when pipeline has a cached result
  if (pipelineCacheKey && hasPipelineCacheEntry(pipelineCacheKey)) {
    return renderStyles(undefined, undefined, undefined, pipelineCacheKey);
  }

  // Cache miss: build filtered styles and run pipeline
  const filteredStyles =
    chunkName === CHUNK_NAMES.SUBCOMPONENTS
      ? buildSubcomponentFilteredStyles(styles, styleKeys)
      : buildFilteredStyles(styles, styleKeys);

  return renderStyles(filteredStyles, undefined, undefined, pipelineCacheKey);
}
