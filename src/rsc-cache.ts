/**
 * Shared RSC (React Server Components) inline style cache.
 *
 * Uses React.cache for per-request memoization in Server Components.
 * Both computeStyles() and standalone style functions (useGlobalStyles,
 * useRawCSS, useKeyframes, useProperty, useFontFace, useCounterStyle)
 * share this cache so that CSS accumulated by standalone functions is
 * flushed into inline <style> tags by the next tasty() component.
 */

import { cache } from 'react';

import type { ServerStyleCollector } from './ssr/collector';
import { getRegisteredSSRCollector } from './ssr/ssr-collector-ref';

export interface RSCStyleCache {
  cacheKeyToClassName: Map<string, string>;
  classCounter: number;
  emittedKeys: Set<string>;
  internalsEmitted: boolean;
  keyframesCounter: number;
  counterStyleCounter: number;
  pendingCSS: string[];
  /** Maps dedup key -> generated name for keyframes and counter-styles in RSC mode. */
  generatedNames: Map<string, string>;
}

/**
 * Per-request RSC style cache using React.cache.
 * React.cache provides per-request memoization in Server Components,
 * so each request gets its own isolated cache.
 */
export const getRSCCache = cache(
  (): RSCStyleCache => ({
    cacheKeyToClassName: new Map(),
    classCounter: 0,
    emittedKeys: new Set(),
    internalsEmitted: false,
    keyframesCounter: 0,
    counterStyleCounter: 0,
    pendingCSS: [],
    generatedNames: new Map(),
  }),
);

export function rscAllocateClassName(
  rscCache: RSCStyleCache,
  cacheKey: string,
): { className: string; isNew: boolean } {
  const existing = rscCache.cacheKeyToClassName.get(cacheKey);
  if (existing) return { className: existing, isNew: false };

  // Use 'r' prefix to avoid collisions with SSR collector's 't' prefix
  const className = `r${rscCache.classCounter++}`;
  rscCache.cacheKeyToClassName.set(cacheKey, className);
  return { className, isNew: true };
}

/**
 * Flush any pending CSS accumulated by standalone functions.
 * Returns the CSS string and clears the buffer.
 */
export function flushPendingCSS(rscCache: RSCStyleCache): string {
  if (rscCache.pendingCSS.length === 0) return '';
  const css = rscCache.pendingCSS.join('\n');
  rscCache.pendingCSS.length = 0;
  return css;
}

/**
 * Push CSS into the RSC pending buffer with dedup via emittedKeys.
 * Returns true if the CSS was added, false if it was already emitted.
 */
export function pushRSCCSS(
  rscCache: RSCStyleCache,
  key: string,
  css: string,
): boolean {
  if (rscCache.emittedKeys.has(key)) return false;
  rscCache.emittedKeys.add(key);
  rscCache.pendingCSS.push(css);
  return true;
}

export type StyleTarget =
  | { mode: 'ssr'; collector: ServerStyleCollector }
  | { mode: 'rsc'; cache: RSCStyleCache }
  | { mode: 'client' };

/**
 * Determine the current style injection target.
 * Centralizes the three-way detection (SSR collector / RSC cache / client DOM)
 * used by all style functions.
 */
export function getStyleTarget(): StyleTarget {
  const collector = getRegisteredSSRCollector();
  if (collector) return { mode: 'ssr', collector };
  if (typeof document === 'undefined')
    return { mode: 'rsc', cache: getRSCCache() };
  return { mode: 'client' };
}
