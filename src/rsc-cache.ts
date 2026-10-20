/**
 * Shared RSC (React Server Components) inline style cache.
 *
 * Uses React.cache for per-request memoization in Server Components.
 * Both computeStyles() and standalone style functions (useGlobalStyles,
 * useRawCSS, useKeyframes, useProperty, useFontFace, useCounterStyle)
 * share this cache so that CSS accumulated by standalone functions is
 * flushed into inline <style> tags by the next tasty() component.
 */

// A default import also loads on React 18, which has no named `cache` export.
import React from 'react';

import { getNamePrefix } from './config';
import type { ServerStyleCollector } from './ssr/collector';
import { getRegisteredSSRCollector } from './ssr/ssr-collector-ref';
import { hashString } from './utils/hash';
import { makeClassName } from './utils/name-prefix';
import { warnOnceDev } from './utils/warnings';

export interface RSCStyleCache {
  cacheKeyToClassName: Map<string, string>;
  emittedKeys: Set<string>;
  internalsEmitted: boolean;
  pendingCSS: string[];
  /** Maps dedup key -> its slot in `pendingCSS`, so slot-keyed CSS can be replaced. */
  keyToIndex: Map<string, number>;
  /** Maps dedup key -> generated name for keyframes and counter-styles in RSC mode. */
  generatedNames: Map<string, string>;
  /** Set once {@link checkRequestScope} has looked at this cache. */
  scopeChecked?: boolean;
}

/**
 * Per-request RSC style cache using React.cache.
 * React.cache provides per-request memoization in Server Components,
 * so each request gets its own isolated cache.
 */
const createRSCCache = (): RSCStyleCache => ({
  cacheKeyToClassName: new Map(),
  emittedKeys: new Set(),
  internalsEmitted: false,
  pendingCSS: [],
  keyToIndex: new Map(),
  generatedNames: new Map(),
});

// React 18 has no RSC cache API. Its client and collector-backed SSR paths do
// not use this cache; a fallback call must still allocate isolated state rather
// than retain one global cache across requests. React 19 keeps request caching.
export const getRSCCache =
  typeof React.cache === 'function'
    ? React.cache(createRSCCache)
    : createRSCCache;

let requestScopeMissing = false;

/**
 * Warn, once and in development, when server rendering finds no request scope:
 * no SSR collector, and `React.cache` does not cache. That is React's standard
 * build — Astro without `tastyIntegration()`, or a client component server
 * rendered without `TastyRegistry` — where `cache` only caches in Server
 * Components. Each call then gets a fresh cache, so every `tasty()` element
 * inlines all of its CSS, and nothing emits the configured globals (tokens,
 * `@property` defaults such as `--gap`, `globalStyles`, `@font-face`) or the CSS
 * of the standalone style functions.
 *
 * Nothing here can stand in for the missing scope: a cache shared beyond one
 * call would leak between requests, or lose CSS rendered into a Suspense
 * boundary that falls back.
 *
 * Called from React rendering only (`tasty()`, `useStyles()`, the style
 * functions). A script calling `computeStyles()` directly gets the CSS back
 * and owns emitting it.
 */
export function checkRequestScope(): void {
  if (requestScopeMissing) return;

  const rscCache = getRSCCache();
  if (rscCache.scopeChecked) return;
  rscCache.scopeChecked = true;

  if (getRSCCache() === rscCache) return;

  // The React build does not change at runtime, so one miss settles it.
  requestScopeMissing = true;
  warnOnceDev(
    'rsc-request-scope',
    'Server rendering without a style collector, outside React Server Components. ' +
      'Each tasty() element inlines all of its CSS, and configured globals (tokens, ' +
      '@property defaults such as --gap, globalStyles, @font-face) and the CSS of ' +
      'useGlobalStyles(), useRawCSS(), useKeyframes() and the other style functions ' +
      'are not emitted. Use tastyIntegration() in Astro, TastyRegistry in Next.js, ' +
      'or runWithCollector() from @tenphi/tasty/ssr elsewhere.',
  );
}

export function rscAllocateClassName(
  rscCache: RSCStyleCache,
  cacheKey: string,
): { className: string; isNew: boolean } {
  const existing = rscCache.cacheKeyToClassName.get(cacheKey);
  if (existing) return { className: existing, isNew: false };

  // Content-hash ensures stable names across all environments (RSC, SSR, client),
  // enabling cross-environment dedup and preventing class collisions.
  const className = makeClassName(getNamePrefix(), hashString(cacheKey));
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
  // The slots are gone with the buffer; a later replace has to append instead.
  rscCache.keyToIndex.clear();
  return css;
}

/**
 * Push CSS into the RSC pending buffer with dedup via emittedKeys.
 * Returns true if the CSS was added, false if it was already emitted.
 *
 * Pass `replace` for slot-keyed entries (an explicit `id`), where the last write
 * must win to match the client's update-tracking behavior. If the slot has
 * already been flushed into a `<style>` tag the new CSS is appended instead,
 * which still wins by cascade order.
 */
export function pushRSCCSS(
  rscCache: RSCStyleCache,
  key: string,
  css: string,
  replace?: boolean,
): boolean {
  if (replace) {
    const pendingIndex = rscCache.keyToIndex.get(key);

    if (pendingIndex !== undefined) {
      rscCache.pendingCSS[pendingIndex] = css;
      return true;
    }
  } else if (rscCache.emittedKeys.has(key)) {
    return false;
  }

  rscCache.emittedKeys.add(key);
  rscCache.keyToIndex.set(key, rscCache.pendingCSS.length);
  rscCache.pendingCSS.push(css);
  return true;
}

/**
 * Queue CSS that `computeStyles()` already deduplicated and returned, for a
 * caller that renders no `<style>` of its own (`useStyles()`). The next
 * `tasty()` element emits it.
 */
export function queueRSCCSS(rscCache: RSCStyleCache, css: string): void {
  rscCache.pendingCSS.push(css);
}

type StyleTarget =
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
  if (typeof document === 'undefined') {
    checkRequestScope();
    return { mode: 'rsc', cache: getRSCCache() };
  }
  return { mode: 'client' };
}
