/**
 * ServerStyleCollector — server-safe style collector for SSR.
 *
 * Accumulates CSS rules and cache metadata during server rendering.
 * This is the server-side counterpart to StyleInjector: it allocates
 * sequential class names (t0, t1, …), formats CSS rules into text,
 * and serializes the cache state for client hydration.
 *
 * One instance is created per HTTP request. Concurrent requests
 * each get their own collector (via AsyncLocalStorage or React context).
 */

import {
  getGlobalProperties,
  hasGlobalProperties,
  INTERNAL_PROPERTIES,
  INTERNAL_TOKENS,
} from '../config';
import type { StyleResult } from '../pipeline';
import { formatPropertyCSS } from './format-property';
import { formatRules } from './format-rules';

/**
 * Cache state serialized to the client for hydration.
 */
export interface SSRCacheState {
  /** cacheKey → className map, to pre-populate the client registry */
  entries: Record<string, string>;
  /** Counter value so client allocations don't collide with server ones */
  classCounter: number;
}

function generateClassName(counter: number): string {
  return `t${counter}`;
}

export class ServerStyleCollector {
  private chunks = new Map<string, string>();
  private cacheKeyToClassName = new Map<string, string>();
  private classCounter = 0;
  private flushedKeys = new Set<string>();
  private propertyRules = new Map<string, string>();
  private flushedPropertyKeys = new Set<string>();
  private keyframeRules = new Map<string, string>();
  private flushedKeyframeKeys = new Set<string>();
  private globalStyles = new Map<string, string>();
  private flushedGlobalKeys = new Set<string>();
  private rawCSS = new Map<string, string>();
  private flushedRawKeys = new Set<string>();
  private keyframesCounter = 0;
  private internalsCollected = false;

  /**
   * Collect internal @property rules and :root token defaults.
   * Mirrors markStylesGenerated() from the client-side injector.
   * Called automatically on first chunk collection; idempotent.
   */
  collectInternals(): void {
    if (this.internalsCollected) return;
    this.internalsCollected = true;

    for (const [token, definition] of Object.entries(INTERNAL_PROPERTIES)) {
      const css = formatPropertyCSS(token, definition);
      if (css) {
        this.collectProperty(`__internal:${token}`, css);
      }
    }

    if (hasGlobalProperties()) {
      const globalProps = getGlobalProperties();
      if (globalProps) {
        for (const [token, definition] of Object.entries(globalProps)) {
          const css = formatPropertyCSS(token, definition);
          if (css) {
            this.collectProperty(`__global:${token}`, css);
          }
        }
      }
    }

    const tokenEntries = Object.entries(INTERNAL_TOKENS);
    if (tokenEntries.length > 0) {
      const declarations = tokenEntries
        .map(([name, value]) => `${name}: ${value}`)
        .join('; ');
      this.collectProperty(
        '__internal:root-tokens',
        `:root { ${declarations} }`,
      );
    }
  }

  /**
   * Allocate a className for a cache key, server-side.
   * Mirrors StyleInjector.allocateClassName but without DOM access.
   */
  allocateClassName(cacheKey: string): {
    className: string;
    isNewAllocation: boolean;
  } {
    const existing = this.cacheKeyToClassName.get(cacheKey);
    if (existing) {
      return { className: existing, isNewAllocation: false };
    }

    const className = generateClassName(this.classCounter++);
    this.cacheKeyToClassName.set(cacheKey, className);

    return { className, isNewAllocation: true };
  }

  /**
   * Record CSS rules for a chunk.
   * Called by useStyles during server render.
   */
  collectChunk(
    cacheKey: string,
    className: string,
    rules: StyleResult[],
  ): void {
    if (this.chunks.has(cacheKey)) return;
    const css = formatRules(rules, className);
    if (css) {
      this.chunks.set(cacheKey, css);
    }
  }

  /**
   * Record a @property rule. Deduplicated by name.
   */
  collectProperty(name: string, css: string): void {
    if (!this.propertyRules.has(name)) {
      this.propertyRules.set(name, css);
    }
  }

  /**
   * Record a @keyframes rule. Deduplicated by name.
   */
  collectKeyframes(name: string, css: string): void {
    if (!this.keyframeRules.has(name)) {
      this.keyframeRules.set(name, css);
    }
  }

  /**
   * Allocate a keyframe name for SSR. Uses provided name or generates one.
   */
  allocateKeyframeName(providedName?: string): string {
    return providedName ?? `k${this.keyframesCounter++}`;
  }

  /**
   * Record global styles (from useGlobalStyles). Deduplicated by key.
   */
  collectGlobalStyles(key: string, css: string): void {
    if (!this.globalStyles.has(key)) {
      this.globalStyles.set(key, css);
    }
  }

  /**
   * Record raw CSS text (from useRawCSS). Deduplicated by key.
   */
  collectRawCSS(key: string, css: string): void {
    if (!this.rawCSS.has(key)) {
      this.rawCSS.set(key, css);
    }
  }

  /**
   * Extract all CSS collected so far as a single string.
   * Includes @property and @keyframes rules.
   * Used for non-streaming SSR (renderToString).
   */
  getCSS(): string {
    const parts: string[] = [];

    for (const css of this.propertyRules.values()) {
      parts.push(css);
    }

    for (const css of this.rawCSS.values()) {
      parts.push(css);
    }

    for (const css of this.globalStyles.values()) {
      parts.push(css);
    }

    for (const css of this.chunks.values()) {
      parts.push(css);
    }

    for (const css of this.keyframeRules.values()) {
      parts.push(css);
    }

    return parts.join('\n');
  }

  /**
   * Flush only newly collected CSS since the last flush.
   * Used for streaming SSR (renderToPipeableStream + useServerInsertedHTML).
   */
  flushCSS(): string {
    const parts: string[] = [];

    for (const [name, css] of this.propertyRules) {
      if (!this.flushedPropertyKeys.has(name)) {
        parts.push(css);
        this.flushedPropertyKeys.add(name);
      }
    }

    for (const [key, css] of this.rawCSS) {
      if (!this.flushedRawKeys.has(key)) {
        parts.push(css);
        this.flushedRawKeys.add(key);
      }
    }

    for (const [key, css] of this.globalStyles) {
      if (!this.flushedGlobalKeys.has(key)) {
        parts.push(css);
        this.flushedGlobalKeys.add(key);
      }
    }

    for (const [key, css] of this.chunks) {
      if (!this.flushedKeys.has(key)) {
        parts.push(css);
        this.flushedKeys.add(key);
      }
    }

    for (const [name, css] of this.keyframeRules) {
      if (!this.flushedKeyframeKeys.has(name)) {
        parts.push(css);
        this.flushedKeyframeKeys.add(name);
      }
    }

    return parts.join('\n');
  }

  /**
   * Serialize the cache state for client hydration.
   */
  getCacheState(): SSRCacheState {
    const entries: Record<string, string> = {};
    for (const [cacheKey, className] of this.cacheKeyToClassName) {
      entries[cacheKey] = className;
    }
    return { entries, classCounter: this.classCounter };
  }
}
