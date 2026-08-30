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
import {
  getEffectiveDefinition,
  normalizePropertyDefinition,
} from '../properties';
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
import {
  getPrecompiledRevision,
  getRegisteredPrecompiledDependencies,
} from '../precompile/runtime';
import type {
  PrecompiledCounterStyleCacheEntry,
  PrecompiledKeyframeCacheEntry,
  PrecompiledPropertyCacheEntry,
  TastyPrecompiledChunk,
  TastyPrecompiledDependencies,
  TastyStyleArtifactSource,
} from '../precompile/types';

export type ServerStyleArtifactKind =
  | 'property'
  | 'font-face'
  | 'counter-style'
  | 'function'
  | 'raw'
  | 'global'
  | 'chunk'
  | 'keyframes';

export interface ServerStyleArtifact {
  /** Stable identifier derived from the artifact kind, logical key, and CSS. */
  id: string;
  kind: ServerStyleArtifactKind;
  css: string;
  /** Zero-based position in the collector's final cascade order. */
  order: number;
  /** Origin of the rule. */
  source: TastyStyleArtifactSource;
}

interface CollectArtifactOptions {
  source?: TastyStyleArtifactSource;
}

interface CollectPropertyOptions extends CollectArtifactOptions {
  cssName?: string;
  normalizedDefinition?: string;
  rscKey?: string;
}

interface CollectKeyframesOptions extends CollectArtifactOptions {
  contentKey?: string;
  rscKeys?: readonly string[];
}

interface CollectCounterStyleOptions extends CollectArtifactOptions {
  weak?: boolean;
  rscKeys?: readonly string[];
}

function artifactId(kind: ServerStyleArtifactKind, key: string, css: string) {
  const content = `${kind}\0${key}\0${css}`;
  return `${kind}:${hashString(content)}:${content.length.toString(36)}`;
}

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
  private artifactSources = new Map<string, TastyStyleArtifactSource>();
  private precompiledChunks = new Map<string, TastyPrecompiledChunk>();
  private precompiledProperties = new Map<
    string,
    PrecompiledPropertyCacheEntry
  >();
  private precompiledKeyframes = new Map<
    string,
    PrecompiledKeyframeCacheEntry
  >();
  private precompiledFontFaces = new Set<string>();
  private precompiledCounterStyles = new Map<
    string,
    PrecompiledCounterStyleCacheEntry
  >();
  private precompiledFunctions = new Set<string>();
  private precompiledRSCKeys = new Set<string>();
  private appliedPrecompiledRevision = -1;
  private externalProperties = new Set<string>();
  private externalKeyframes = new Set<string>();
  private externalFontFaces = new Set<string>();
  private externalCounterStyles = new Set<string>();
  private externalFunctions = new Set<string>();
  private precompileRecording = false;

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
    this.applyRegisteredPrecompiledDependencies();
  }

  private sourceKey(kind: ServerStyleArtifactKind, key: string): string {
    return `${kind}\0${key}`;
  }

  private setSource(
    kind: ServerStyleArtifactKind,
    key: string,
    source: TastyStyleArtifactSource,
  ): void {
    this.artifactSources.set(this.sourceKey(kind, key), source);
  }

  /** Pick up manifests registered after this collector was constructed. */
  applyRegisteredPrecompiledDependencies(): void {
    const revision = getPrecompiledRevision();
    if (revision === this.appliedPrecompiledRevision) return;
    this.appliedPrecompiledRevision = revision;

    this.externalProperties.clear();
    this.externalKeyframes.clear();
    this.externalFontFaces.clear();
    this.externalCounterStyles.clear();
    this.externalFunctions.clear();

    // Catalog generation deliberately records a self-contained artifact even
    // when another package registered precompiled styles in this process.
    if (this.precompileRecording) return;

    const dependencies = getRegisteredPrecompiledDependencies(this.namePrefix);
    for (const item of dependencies.properties) {
      this.externalProperties.add(item.name);
    }
    for (const item of dependencies.keyframes) {
      this.externalKeyframes.add(item.contentKey);
    }
    for (const hash of dependencies.fontFaces) this.externalFontFaces.add(hash);
    for (const item of dependencies.counterStyles) {
      this.externalCounterStyles.add(item.name);
    }
    for (const name of dependencies.functions) this.externalFunctions.add(name);
  }

  private generateClassName(cacheKey: string): string {
    return makeClassName(this.namePrefix, hashString(cacheKey));
  }

  /** @internal Enable build-time chunk lookup metadata collection. */
  enablePrecompileRecording(): void {
    this.precompileRecording = true;
    // A catalog build must be self-contained even if this process previously
    // registered another package's manifest.
    this.externalProperties.clear();
    this.externalKeyframes.clear();
    this.externalFontFaces.clear();
    this.externalCounterStyles.clear();
    this.externalFunctions.clear();
  }

  /** @internal Whether this collector is producing a catalog artifact. */
  isPrecompileRecording(): boolean {
    return this.precompileRecording;
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
        const effective = getEffectiveDefinition(token, definition);
        this.collectProperty(`__prop:${token}`, css, {
          source: 'config',
          cssName: effective.isValid ? effective.cssName : undefined,
          normalizedDefinition: effective.isValid
            ? normalizePropertyDefinition(effective.definition)
            : undefined,
        });
      }
    }

    const tokenStyles = getGlobalConfigTokens();
    if (tokenStyles && Object.keys(tokenStyles).length > 0) {
      const tokenRules = renderStyles(tokenStyles, ':root') as StyleResult[];
      if (tokenRules.length > 0) {
        const css = formatGlobalRules(tokenRules);
        if (css) {
          this.collectGlobalStyles('__global:tokens', css, false, {
            source: 'config',
          });
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
          this.collectFontFace(hash, css, { source: 'config' });
        }
      }
    }

    const globalCS = getGlobalCounterStyles();
    if (globalCS) {
      for (const [name, descriptors] of Object.entries(globalCS)) {
        const css = formatCounterStyleRule(name, descriptors);
        this.collectCounterStyle(name, css, {
          weak: true,
          source: 'config',
        });
      }
    }

    const globalFn = getGlobalFunctions();
    if (globalFn) {
      for (const [name, definition] of Object.entries(globalFn)) {
        const css = formatFunctionRule(name, definition);
        this.collectFunction(parseFunctionName(name), css, {
          weak: true,
          source: 'config',
        });
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
              this.collectGlobalStyles(
                `__global:styles:${selector}`,
                css,
                false,
                { source: 'config' },
              );
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
      this.setSource('chunk', cacheKey, 'component');
    }
  }

  /** Record the pre-render lookup key corresponding to a collected chunk. */
  recordPrecompiledChunk(
    lookupKey: string,
    className: string,
    animations: readonly string[],
  ): void {
    if (!this.precompiledChunks.has(lookupKey)) {
      this.precompiledChunks.set(lookupKey, {
        lookupKey,
        className,
        animations: [...animations],
      });
    }
  }

  /**
   * Record a @property rule. Deduplicated by name.
   */
  collectProperty(
    name: string,
    css: string,
    options?: CollectPropertyOptions,
  ): void {
    if (options?.cssName && this.externalProperties.has(options.cssName))
      return;
    if (!this.propertyRules.has(name)) {
      this.propertyRules.set(name, css);
      this.setSource('property', name, options?.source ?? 'component');
    } else if ((options?.source ?? 'component') === 'component') {
      this.setSource('property', name, 'component');
    }
    if (
      (options?.source ?? 'component') === 'component' &&
      options?.cssName &&
      options.normalizedDefinition !== undefined
    ) {
      this.precompiledProperties.set(options.cssName, {
        name: options.cssName,
        definition: options.normalizedDefinition,
      });
      if (options.rscKey) this.precompiledRSCKeys.add(options.rscKey);
    }
  }

  /**
   * Record a @keyframes rule. Deduplicated by name.
   */
  collectKeyframes(
    name: string,
    css: string,
    options?: CollectKeyframesOptions,
  ): void {
    if (options?.contentKey && this.externalKeyframes.has(options.contentKey)) {
      return;
    }
    if (!this.keyframeRules.has(name)) {
      this.keyframeRules.set(name, css);
      this.setSource('keyframes', name, options?.source ?? 'component');
    } else if ((options?.source ?? 'component') === 'component') {
      this.setSource('keyframes', name, 'component');
    }
    if (
      (options?.source ?? 'component') === 'component' &&
      options?.contentKey
    ) {
      const existing = this.precompiledKeyframes.get(options.contentKey);
      const rscKeys = new Set(existing?.rscKeys ?? []);
      for (const key of options.rscKeys ?? []) rscKeys.add(key);
      this.precompiledKeyframes.set(options.contentKey, {
        name,
        contentKey: options.contentKey,
        rscKeys: [...rscKeys],
      });
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
  collectFontFace(
    key: string,
    css: string,
    options?: CollectArtifactOptions,
  ): void {
    if (this.externalFontFaces.has(key)) return;
    if (!this.fontFaceRules.has(key)) {
      this.fontFaceRules.set(key, css);
      this.setSource('font-face', key, options?.source ?? 'component');
    } else if ((options?.source ?? 'component') === 'component') {
      this.setSource('font-face', key, 'component');
    }
    if ((options?.source ?? 'component') === 'component') {
      this.precompiledFontFaces.add(key);
      this.precompiledRSCKeys.add(`__ff:${key}`);
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
    options?: CollectCounterStyleOptions,
  ): void {
    if (this.externalCounterStyles.has(name)) return;
    const source = options?.source ?? 'component';
    const existing = this.counterStyleRules.get(name);
    if (existing === undefined) {
      this.counterStyleRules.set(name, css);
      this.setSource('counter-style', name, source);
      if (source === 'component') {
        this.precompiledCounterStyles.set(name, {
          name,
          rscKeys: [...(options?.rscKeys ?? [])],
        });
      }
      return;
    }
    if (source === 'component') {
      this.precompiledCounterStyles.set(name, {
        name,
        rscKeys: [...(options?.rscKeys ?? [])],
      });
      if (existing === css) this.setSource('counter-style', name, 'component');
    }
    if (options?.weak || existing === css) return;
    this.counterStyleRules.set(name, css);
    this.setSource('counter-style', name, source);
    if (source === 'component') {
      this.precompiledCounterStyles.set(name, {
        name,
        rscKeys: [...(options?.rscKeys ?? [])],
      });
    }
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
    options?: { weak?: boolean; source?: TastyStyleArtifactSource },
  ): void {
    if (this.externalFunctions.has(name)) return;
    const source = options?.source ?? 'component';
    const existing = this.functionRules.get(name);
    if (existing === undefined) {
      this.functionRules.set(name, css);
      this.setSource('function', name, source);
      if (source === 'component') {
        this.precompiledFunctions.add(name);
        this.precompiledRSCKeys.add(`__func:${name}`);
      }
      return;
    }
    if (source === 'component') {
      this.precompiledFunctions.add(name);
      this.precompiledRSCKeys.add(`__func:${name}`);
      if (existing === css) this.setSource('function', name, 'component');
    }
    if (options?.weak || existing === css) return;
    this.functionRules.set(name, css);
    this.setSource('function', name, source);
    if (source === 'component') {
      this.precompiledFunctions.add(name);
      this.precompiledRSCKeys.add(`__func:${name}`);
    }
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
   *
   * Pass `replace` for slot-keyed entries (an explicit `id`), where the last
   * write must win to match the client's update-tracking behavior.
   */
  collectGlobalStyles(
    key: string,
    css: string,
    replace?: boolean,
    options?: CollectArtifactOptions,
  ): void {
    if (replace || !this.globalStyles.has(key)) {
      this.globalStyles.set(key, css);
      this.setSource('global', key, options?.source ?? 'global');
    }
  }

  /**
   * Record raw CSS text (from useRawCSS). Deduplicated by key.
   *
   * Pass `replace` for slot-keyed entries (an explicit `id`), where the last
   * write must win to match the client's update-tracking behavior.
   */
  collectRawCSS(
    key: string,
    css: string,
    replace?: boolean,
    options?: CollectArtifactOptions,
  ): void {
    if (replace || !this.rawCSS.has(key)) {
      this.rawCSS.set(key, css);
      this.setSource('raw', key, options?.source ?? 'global');
    }
  }

  getPrecompiledChunks(): TastyPrecompiledChunk[] {
    return [...this.precompiledChunks.values()];
  }

  getPrecompiledDependencies(): TastyPrecompiledDependencies {
    return {
      properties: [...this.precompiledProperties.values()],
      keyframes: [...this.precompiledKeyframes.values()],
      fontFaces: [...this.precompiledFontFaces],
      counterStyles: [...this.precompiledCounterStyles.values()],
      functions: [...this.precompiledFunctions],
      rscKeys: [...this.precompiledRSCKeys],
    };
  }

  /**
   * Return the collected CSS as structured, ordered artifacts.
   *
   * Artifact boundaries are part of the collector output so build tools never
   * need to split or parse CSS text. IDs include the logical collection key
   * and content, making them stable across equivalent page renders while a CSS
   * change always produces a different ID.
   */
  getArtifacts(): ServerStyleArtifact[] {
    const artifacts: ServerStyleArtifact[] = [];

    const append = (
      kind: ServerStyleArtifactKind,
      entries: Iterable<[string, string]>,
    ) => {
      for (const [key, css] of entries) {
        artifacts.push({
          id: artifactId(kind, key, css),
          kind,
          css,
          order: artifacts.length,
          source:
            this.artifactSources.get(this.sourceKey(kind, key)) ?? 'component',
        });
      }
    };

    append('property', this.propertyRules);
    append('font-face', this.fontFaceRules);
    append('counter-style', this.counterStyleRules);
    append('function', this.functionRules);
    append('raw', this.rawCSS);
    append('global', this.globalStyles);
    append('chunk', this.chunks);
    append('keyframes', this.keyframeRules);

    return artifacts;
  }

  /**
   * Extract all CSS collected so far as a single string.
   * Includes @property and @keyframes rules.
   * Used for non-streaming SSR (renderToString).
   */
  getCSS(): string {
    return this.getArtifacts()
      .map(({ css }) => css)
      .join('\n');
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
