/**
 * ServerStyleCollector — server-safe style collector for SSR.
 *
 * Accumulates CSS rules and cache metadata during server rendering.
 * This is the server-side counterpart to StyleInjector: it allocates
 * hash-based class names using the configured `namePrefix` (defaults
 * to `'t'`), formats CSS rules into text, and tracks rendered class
 * names for lightweight client transfer.
 *
 * One instance is created per HTTP request. Concurrent requests
 * each get their own collector (via AsyncLocalStorage or React context).
 */

import {
  getEffectiveProperties,
  getGlobalStyles,
  getGlobalCounterStyles,
  getGlobalFontFaces,
  getGlobalFunctions,
  getGlobalConfigTokens,
  getNamePrefix,
} from '../config';
import { formatCounterStyleRule } from '../counter-style';
import { fontFaceContentHash, formatFontFaceRule } from '../font-face';
import { formatFunctionRule, parseFunctionName } from '../functions';
import { renderStyles } from '../pipeline';
import type { StyleResult } from '../pipeline';
import { hashString } from '../utils/hash';
import {
  makeClassName,
  makeCounterStyleName,
  makeKeyframeName,
  validateNamePrefix,
} from '../utils/name-prefix';
import { formatPropertyCSS } from './format-property';
import { formatGlobalRules } from './format-global-rules';
import { formatRules } from './format-rules';

export class ServerStyleCollector {
  private chunks = new Map<string, string>();
  private cacheKeyToClassName = new Map<string, string>();
  private flushedKeys = new Set<string>();
  private propertyRules = new Map<string, string>();
  private flushedPropertyKeys = new Set<string>();
  private keyframeRules = new Map<string, string>();
  private flushedKeyframeKeys = new Set<string>();
  private globalStyles = new Map<string, string>();
  private flushedGlobalKeys = new Set<string>();
  private rawCSS = new Map<string, string>();
  private flushedRawKeys = new Set<string>();
  private fontFaceRules = new Map<string, string>();
  private flushedFontFaceKeys = new Set<string>();
  private counterStyleRules = new Map<string, string>();
  private flushedCounterStyleKeys = new Set<string>();
  private functionRules = new Map<string, string>();
  private flushedFunctionKeys = new Set<string>();
  private keyframesCounter = 0;
  private counterStyleCounter = 0;
  private internalsCollected = false;
  private namePrefix: string;

  /**
   * @param namePrefix - Optional override for the configured prefix.
   *   Defaults to the value from `configure({ namePrefix })` (or `'t'`).
   *   Pass an explicit prefix when constructing a collector outside the
   *   normal configure() lifecycle (e.g. in tests). Validated eagerly
   *   so misconfiguration fails before any CSS is collected.
   */
  constructor(namePrefix?: string) {
    if (namePrefix !== undefined) {
      validateNamePrefix(namePrefix);
    }
    this.namePrefix = namePrefix ?? getNamePrefix();
  }

  private generateClassName(cacheKey: string): string {
    return makeClassName(this.namePrefix, hashString(cacheKey));
  }

  /**
   * Collect internal @property rules and :root token defaults.
   * Mirrors markStylesGenerated() from the client-side injector.
   * Called automatically on first chunk collection; idempotent.
   *
   * Internals are always emitted here — the RSC path deliberately
   * defers to SSR so that tokens appear exactly once per page in
   * <style data-tasty-ssr> (avoiding duplication of large token sets).
   */
  collectInternals(): void {
    if (this.internalsCollected) return;
    this.internalsCollected = true;

    for (const [token, definition] of Object.entries(
      getEffectiveProperties(),
    )) {
      const css = formatPropertyCSS(token, definition);
      if (css) {
        this.collectProperty(`__prop:${token}`, css);
      }
    }

    const tokenStyles = getGlobalConfigTokens();
    if (tokenStyles && Object.keys(tokenStyles).length > 0) {
      const tokenRules = renderStyles(tokenStyles, ':root') as StyleResult[];
      if (tokenRules.length > 0) {
        const css = formatGlobalRules(tokenRules);
        if (css) {
          this.collectGlobalStyles('__global:tokens', css);
        }
      }
    }

    const globalFF = getGlobalFontFaces();
    if (globalFF) {
      for (const [family, input] of Object.entries(globalFF)) {
        const descriptors = Array.isArray(input) ? input : [input];
        for (const desc of descriptors) {
          const hash = fontFaceContentHash(family, desc);
          const css = formatFontFaceRule(family, desc);
          this.collectFontFace(hash, css);
        }
      }
    }

    const globalCS = getGlobalCounterStyles();
    if (globalCS) {
      for (const [name, descriptors] of Object.entries(globalCS)) {
        const css = formatCounterStyleRule(name, descriptors);
        this.collectCounterStyle(name, css, { weak: true });
      }
    }

    const globalFn = getGlobalFunctions();
    if (globalFn) {
      for (const [name, definition] of Object.entries(globalFn)) {
        const css = formatFunctionRule(name, definition);
        this.collectFunction(parseFunctionName(name), css, { weak: true });
      }
    }

    const globalStyles = getGlobalStyles();
    if (globalStyles) {
      for (const [selector, styles] of Object.entries(globalStyles)) {
        if (Object.keys(styles).length > 0) {
          const rules = renderStyles(styles, selector) as StyleResult[];
          if (rules.length > 0) {
            const css = formatGlobalRules(rules);
            if (css) {
              this.collectGlobalStyles(`__global:styles:${selector}`, css);
            }
          }
        }
      }
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

    const className = this.generateClassName(cacheKey);
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
    return (
      providedName ??
      makeKeyframeName(this.namePrefix, String(this.keyframesCounter++))
    );
  }

  /**
   * Record a @font-face rule. Deduplicated by key (content hash).
   */
  collectFontFace(key: string, css: string): void {
    if (!this.fontFaceRules.has(key)) {
      this.fontFaceRules.set(key, css);
    }
  }

  /**
   * Record a @counter-style rule. Deduplicated by name and overrides an
   * existing rule by default. Pass `weak: true` for global `configure()`
   * definitions, which never clobber an existing rule.
   */
  collectCounterStyle(
    name: string,
    css: string,
    options?: { weak?: boolean },
  ): void {
    const existing = this.counterStyleRules.get(name);
    if (existing === undefined) {
      this.counterStyleRules.set(name, css);
      return;
    }
    if (options?.weak || existing === css) return;
    this.counterStyleRules.set(name, css);
    // If a rule with this name was already flushed (streaming), allow the
    // overriding rule to be flushed again so it wins by source order.
    this.flushedCounterStyleKeys.delete(name);
  }

  /**
   * Record a @function rule. Deduplicated by CSS function name and overrides an
   * existing rule by default. Pass `weak: true` for global `configure()`
   * definitions, which never clobber an existing rule.
   */
  collectFunction(
    name: string,
    css: string,
    options?: { weak?: boolean },
  ): void {
    const existing = this.functionRules.get(name);
    if (existing === undefined) {
      this.functionRules.set(name, css);
      return;
    }
    if (options?.weak || existing === css) return;
    this.functionRules.set(name, css);
    // If a rule with this name was already flushed (streaming), allow the
    // overriding rule to be flushed again so it wins by source order.
    this.flushedFunctionKeys.delete(name);
  }

  /**
   * Allocate a counter-style name for SSR. Uses provided name or generates one.
   */
  allocateCounterStyleName(providedName?: string): string {
    return (
      providedName ??
      makeCounterStyleName(this.namePrefix, String(this.counterStyleCounter++))
    );
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

    for (const css of this.fontFaceRules.values()) {
      parts.push(css);
    }

    for (const css of this.counterStyleRules.values()) {
      parts.push(css);
    }

    for (const css of this.functionRules.values()) {
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

    for (const [key, css] of this.fontFaceRules) {
      if (!this.flushedFontFaceKeys.has(key)) {
        parts.push(css);
        this.flushedFontFaceKeys.add(key);
      }
    }

    for (const [key, css] of this.counterStyleRules) {
      if (!this.flushedCounterStyleKeys.has(key)) {
        parts.push(css);
        this.flushedCounterStyleKeys.add(key);
      }
    }

    for (const [key, css] of this.functionRules) {
      if (!this.flushedFunctionKeys.has(key)) {
        parts.push(css);
        this.flushedFunctionKeys.add(key);
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

  private flushedClassNames = new Set<string>();

  /**
   * Return class names rendered since the last call (for streaming).
   * Used to emit lightweight class-list scripts for client hydration.
   */
  getRenderedClassNames(): string[] {
    const names: string[] = [];
    for (const className of this.cacheKeyToClassName.values()) {
      if (!this.flushedClassNames.has(className)) {
        this.flushedClassNames.add(className);
        names.push(className);
      }
    }
    return names;
  }
}

/**
 * Factory for creating a {@link ServerStyleCollector} instance.
 *
 * Canonical functional entry point; the `ServerStyleCollector` class remains
 * exported for advanced/internal use.
 *
 * @param namePrefix - Optional override for the configured class-name prefix.
 *   Defaults to the value from `configure({ namePrefix })` (or `'t'`).
 *
 * @example
 * ```ts
 * import { createServerStyleCollector } from '@tenphi/tasty/ssr';
 *
 * const collector = createServerStyleCollector();
 * ```
 */
export function createServerStyleCollector(
  namePrefix?: string,
): ServerStyleCollector {
  return new ServerStyleCollector(namePrefix);
}
