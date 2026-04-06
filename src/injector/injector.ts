/**
 * Style injector that works with structured style objects
 * Eliminates CSS string parsing for better performance
 */

import type { StyleResult } from '../pipeline';
import {
  getEffectiveDefinition,
  normalizePropertyDefinition,
} from '../properties';
import { isDevEnv } from '../utils/is-dev-env';
import type { StyleValue } from '../utils/styles';
import { parseStyle } from '../utils/styles';

import { SheetManager } from './sheet-manager';
import { fontFaceContentHash, formatFontFaceDeclarations } from '../font-face';
import { formatCounterStyleDeclarations } from '../counter-style';
import type {
  CacheMetrics,
  CounterStyleDescriptors,
  FontFaceDescriptors,
  GCOptions,
  GlobalInjectResult,
  InjectResult,
  KeyframesResult,
  KeyframesSteps,
  PropertyDefinition,
  RawCSSResult,
  RootRegistry,
  StyleInjectorConfig,
  StyleRule,
} from './types';

/**
 * Generate sequential class name with format t{number}
 */
function generateClassName(counter: number): string {
  return `t${counter}`;
}

export class StyleInjector {
  private sheetManager: SheetManager;
  private config: StyleInjectorConfig;
  private globalRuleCounter = 0;
  private lastGCTime = 0;
  private backgroundSweepTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingGCHandle: ReturnType<typeof requestIdleCallback> | null = null;

  /** @internal — exposed for debug utilities only */
  get _sheetManager(): SheetManager {
    return this.sheetManager;
  }

  constructor(config: StyleInjectorConfig = {}) {
    this.config = config;
    this.sheetManager = new SheetManager(config);

    if (config.gc?.auto && typeof document !== 'undefined') {
      const interval = config.gc.autoInterval ?? 300_000;
      const scheduleNext = () => {
        this.backgroundSweepTimeout = setTimeout(() => {
          const doSweep = () => {
            this.sheetManager.pruneDisconnectedRoots();
            for (const root of this.sheetManager.getActiveRoots()) {
              this.gc({ root });
            }
            scheduleNext();
          };
          if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => doSweep());
          } else {
            doSweep();
          }
        }, interval);
      };
      scheduleNext();
    }
  }

  /**
   * Allocate a className for a cacheKey without injecting styles yet.
   * This allows separating className allocation (render phase) from style injection (insertion phase).
   */
  allocateClassName(
    cacheKey: string,
    options?: { root?: Document | ShadowRoot },
  ): { className: string; isNewAllocation: boolean } {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    // Check if we can reuse existing className for this cache key
    if (registry.cacheKeyToClassName.has(cacheKey)) {
      const className = registry.cacheKeyToClassName.get(cacheKey)!;
      return {
        className,
        isNewAllocation: false,
      };
    }

    // Generate new className and reserve it
    const className = generateClassName(registry.classCounter++);

    // Create placeholder RuleInfo to reserve the className
    const placeholderRuleInfo = {
      className,
      ruleIndex: -1, // Placeholder - will be set during actual injection
      sheetIndex: -1, // Placeholder - will be set during actual injection
    };

    // Store RuleInfo only once by className, and map cacheKey separately
    registry.rules.set(className, placeholderRuleInfo);
    registry.cacheKeyToClassName.set(cacheKey, className);

    return {
      className,
      isNewAllocation: true,
    };
  }

  /**
   * Inject styles from StyleResult objects
   */
  inject(
    rules: StyleResult[],
    options?: { root?: Document | ShadowRoot; cacheKey?: string },
  ): InjectResult {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    if (rules.length === 0) {
      return {
        className: '',
        dispose: () => {
          /* noop */
        },
      };
    }

    // Rules are now in StyleRule format directly

    // Check if we can reuse based on cache key
    const cacheKey = options?.cacheKey;
    let className: string;
    let isPreAllocated = false;

    if (cacheKey && registry.cacheKeyToClassName.has(cacheKey)) {
      // Reuse existing class for this cache key
      className = registry.cacheKeyToClassName.get(cacheKey)!;
      const existingRuleInfo = registry.rules.get(className)!;

      // Check if this is a placeholder (pre-allocated but not yet injected)
      isPreAllocated =
        existingRuleInfo.ruleIndex === -1 && existingRuleInfo.sheetIndex === -1;

      if (!isPreAllocated) {
        // Already injected - just increment refCount
        const currentRefCount = registry.refCounts.get(className) || 0;
        registry.refCounts.set(className, currentRefCount + 1);

        // Update metrics
        if (registry.metrics) {
          registry.metrics.hits++;
        }

        return {
          className,
          dispose: () => this.dispose(className, registry),
        };
      }
    } else {
      // Generate new className
      className = generateClassName(registry.classCounter++);
    }

    // Process rules: handle needsClassName flag and apply specificity
    const rulesToInsert = rules.map((rule) => {
      let newSelector = rule.selector;

      // If rule needs className prepended
      if (rule.needsClassName) {
        // Handle multiple selectors (separated by ||| for OR conditions)
        const selectorParts = newSelector ? newSelector.split('|||') : [''];

        const classPrefix = `.${className}.${className}`;

        newSelector = selectorParts
          .map((part) => {
            const classSelector = part ? `${classPrefix}${part}` : classPrefix;

            // If there's a root prefix, add it before the class selector
            if (rule.rootPrefix) {
              return `${rule.rootPrefix} ${classSelector}`;
            }
            return classSelector;
          })
          .join(', ');
      }

      return {
        ...rule,
        selector: newSelector,
        needsClassName: undefined, // Remove the flag after processing
        rootPrefix: undefined, // Remove rootPrefix after processing
      };
    });

    // Auto-register @property for custom properties with inferable types.
    // Colors are detected by --*-color name pattern, numeric types by value.
    if (this.config.autoPropertyTypes !== false) {
      const resolver = registry.propertyTypeResolver;
      const defined = registry.injectedProperties;
      for (const rule of rulesToInsert) {
        if (!rule.declarations) continue;
        resolver.scanDeclarations(
          rule.declarations,
          (name) => defined.has(name),
          (name, syntax, initialValue) => {
            this.property(name, {
              syntax,
              inherits: true,
              initialValue,
              root,
            });
          },
        );
      }
    }

    // Insert rules using existing sheet manager
    const ruleInfo = this.sheetManager.insertRule(
      registry,
      rulesToInsert,
      className,
      root,
    );

    if (!ruleInfo) {
      // Update metrics
      if (registry.metrics) {
        registry.metrics.misses++;
      }

      return {
        className,
        dispose: () => {
          /* noop */
        },
      };
    }

    // Store in registry
    registry.refCounts.set(className, 1);

    if (isPreAllocated) {
      // Update the existing placeholder entry with real rule info
      registry.rules.set(className, ruleInfo);
      // cacheKey mapping already exists from allocation
    } else {
      // Store new entries
      registry.rules.set(className, ruleInfo);
      if (cacheKey) {
        registry.cacheKeyToClassName.set(cacheKey, className);
      }
    }

    // Update metrics
    if (registry.metrics) {
      registry.metrics.totalInsertions++;
      registry.metrics.misses++;
    }

    return {
      className,
      dispose: () => this.dispose(className, registry),
    };
  }

  /**
   * Inject global styles (rules without a generated tasty class selector)
   * This ensures we don't reserve a tasty class name (t{number}) for global rules,
   * which could otherwise collide with element-level styles and break lookups.
   */
  injectGlobal(
    rules: StyleResult[],
    options?: { root?: Document | ShadowRoot },
  ): GlobalInjectResult {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    if (!rules || rules.length === 0) {
      return {
        dispose: () => {
          /* noop */
        },
      };
    }

    // Auto-register @property for custom properties in global rules
    if (this.config.autoPropertyTypes !== false) {
      const resolver = registry.propertyTypeResolver;
      const defined = registry.injectedProperties;
      for (const rule of rules) {
        if (!rule.declarations) continue;
        resolver.scanDeclarations(
          rule.declarations,
          (name) => defined.has(name),
          (name, syntax, initialValue) => {
            this.property(name, {
              syntax,
              inherits: true,
              initialValue,
              root,
            });
          },
        );
      }
    }

    // Use a non-tasty identifier to avoid any collisions with .t{number} classes
    const key = `global:${this.globalRuleCounter++}`;

    const info = this.sheetManager.insertGlobalRule(
      registry,
      rules as unknown as StyleRule[],
      key,
      root,
    );

    if (registry.metrics) {
      registry.metrics.totalInsertions++;
    }

    return {
      dispose: () => {
        if (info) this.sheetManager.deleteGlobalRule(registry, key);
      },
    };
  }

  /**
   * Inject raw CSS text directly without parsing
   * This is a low-overhead alternative to createGlobalStyle for raw CSS
   * The CSS is inserted into a separate style element to avoid conflicts with tasty's chunking
   */
  injectRawCSS(
    css: string,
    options?: { root?: Document | ShadowRoot },
  ): RawCSSResult {
    const root = options?.root || document;
    return this.sheetManager.injectRawCSS(css, root);
  }

  /**
   * Get raw CSS text for SSR
   */
  getRawCSSText(options?: { root?: Document | ShadowRoot }): string {
    const root = options?.root || document;
    return this.sheetManager.getRawCSSText(root);
  }

  /**
   * Increment refCount for an already-injected cacheKey and return a dispose.
   * Used by useStyles on cache hits (hydration or runtime reuse) where
   * the pipeline was skipped but refCount tracking is still needed.
   * Returns null if the cacheKey is not found.
   */
  trackRef(
    cacheKey: string,
    options?: { root?: Document | ShadowRoot },
  ): InjectResult | null {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    if (!registry.cacheKeyToClassName.has(cacheKey)) return null;

    const className = registry.cacheKeyToClassName.get(cacheKey)!;
    const currentRefCount = registry.refCounts.get(className) || 0;
    registry.refCounts.set(className, currentRefCount + 1);

    if (registry.metrics) {
      registry.metrics.hits++;
    }

    return {
      className,
      dispose: () => this.dispose(className, registry),
    };
  }

  /**
   * Dispose of a className (decrements refCount only).
   */
  private dispose(className: string, registry: RootRegistry): void {
    const currentRefCount = registry.refCounts.get(className);
    if (currentRefCount == null || currentRefCount <= 0) {
      return;
    }

    const newRefCount = currentRefCount - 1;
    registry.refCounts.set(className, newRefCount);

    if (newRefCount === 0 && registry.metrics) {
      registry.metrics.totalUnused++;
    }
  }

  /**
   * Force bulk cleanup of unused styles
   */
  cleanup(root?: Document | ShadowRoot): void {
    const registry = this.sheetManager.getRegistry(root || document);
    // Clean up ALL unused rules regardless of batch ratio
    this.sheetManager.forceCleanup(registry);
  }

  /**
   * Get CSS text from all sheets (for SSR)
   */
  getCssText(options?: { root?: Document | ShadowRoot }): string {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    return this.sheetManager.getCssText(registry);
  }

  /**
   * Get CSS only for the provided tasty classNames (e.g., ["t0","t3"])
   */
  getCssTextForClasses(
    classNames: Iterable<string>,
    options?: { root?: Document | ShadowRoot },
  ): string {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    const cssChunks: string[] = [];
    for (const cls of classNames) {
      const info = registry.rules.get(cls);
      if (info) {
        // Always prefer reading from the live stylesheet, since indices can change
        const sheet = registry.sheets[info.sheetIndex];
        const styleSheet = sheet?.sheet?.sheet;
        if (styleSheet) {
          const start = Math.max(0, info.ruleIndex);
          const end = Math.min(
            styleSheet.cssRules.length - 1,
            (info.endRuleIndex as number) ?? info.ruleIndex,
          );
          // Additional validation: ensure indices are valid and in correct order
          if (
            start >= 0 &&
            end >= start &&
            start < styleSheet.cssRules.length
          ) {
            for (let i = start; i <= end; i++) {
              const rule = styleSheet.cssRules[i] as CSSRule | undefined;
              if (rule) cssChunks.push(rule.cssText);
            }
          }
        } else if (info.cssText && info.cssText.length) {
          // Fallback in environments without CSSOM access
          cssChunks.push(...info.cssText);
        }
      }
    }
    return cssChunks.join('\n');
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(options?: { root?: Document | ShadowRoot }): CacheMetrics | null {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    return this.sheetManager.getMetrics(registry);
  }

  /**
   * Reset cache performance metrics
   */
  resetMetrics(options?: { root?: Document | ShadowRoot }): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    this.sheetManager.resetMetrics(registry);
  }

  /**
   * Define a CSS @property custom property.
   *
   * Accepts tasty token syntax for the property name:
   * - `$name` → defines `--name`
   * - `#name` → defines `--name-color` (auto-sets syntax: '<color>', defaults initialValue: 'transparent')
   * - `--name` → defines `--name` (legacy format)
   *
   * Example:
   * @property --rotation { syntax: "<angle>"; inherits: false; initial-value: 45deg; }
   *
   * Note: No caching or dispose — this defines a global property.
   *
   * If the same property is registered with different options, a warning is emitted
   * but the original definition is preserved (CSS @property cannot be redefined).
   */
  property(
    name: string,
    options?: PropertyDefinition & {
      root?: Document | ShadowRoot;
    },
  ): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    // Parse the token and get effective definition
    // This handles $name, #name, --name formats and auto-sets syntax for colors
    const userDefinition: PropertyDefinition = {
      syntax: options?.syntax,
      inherits: options?.inherits,
      initialValue: options?.initialValue,
    };

    const effectiveResult = getEffectiveDefinition(name, userDefinition);

    if (!effectiveResult.isValid) {
      if (isDevEnv()) {
        console.warn(
          `[Tasty] property(): ${effectiveResult.error}. Got: "${name}"`,
        );
      }
      return;
    }

    const cssName = effectiveResult.cssName;
    const definition = effectiveResult.definition;

    // Normalize the definition for comparison
    const normalizedDef = normalizePropertyDefinition(definition);

    // Check if already defined
    const existingDef = registry.injectedProperties.get(cssName);
    if (existingDef !== undefined) {
      return;
    }

    const parts: string[] = [];

    if (definition.syntax != null) {
      let syntax = String(definition.syntax).trim();
      if (!/^['"]/u.test(syntax)) syntax = `"${syntax}"`;
      parts.push(`syntax: ${syntax};`);
    }

    // inherits is required by the CSS @property spec - default to true
    const inherits = definition.inherits ?? true;
    parts.push(`inherits: ${inherits ? 'true' : 'false'};`);

    if (definition.initialValue != null) {
      let initialValueStr: string;
      if (typeof definition.initialValue === 'number') {
        initialValueStr = String(definition.initialValue);
      } else {
        // Process via tasty parser to resolve custom units/functions
        initialValueStr = parseStyle(
          definition.initialValue as StyleValue,
        ).output;
      }
      parts.push(`initial-value: ${initialValueStr};`);
    }

    const declarations = parts.join(' ').trim();

    const rule: StyleRule = {
      selector: `@property ${cssName}`,
      declarations,
    } as StyleRule;

    // Insert as a global rule; only mark injected when insertion succeeds
    const info = this.sheetManager.insertGlobalRule(
      registry,
      [rule],
      `property:${name}`,
      root,
    );

    if (!info) {
      return;
    }

    // Track that this property was injected with its normalized definition
    registry.injectedProperties.set(cssName, normalizedDef);
  }

  /**
   * Check whether a given @property name was already injected by this injector.
   *
   * Accepts tasty token syntax:
   * - `$name` → checks `--name`
   * - `#name` → checks `--name-color`
   * - `--name` → checks `--name` (legacy format)
   */
  isPropertyDefined(
    name: string,
    options?: { root?: Document | ShadowRoot },
  ): boolean {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    // Parse the token to get the CSS property name
    const effectiveResult = getEffectiveDefinition(name, {});
    if (!effectiveResult.isValid) {
      return false;
    }

    return registry.injectedProperties.has(effectiveResult.cssName);
  }

  /**
   * Inject a CSS @font-face rule.
   *
   * Permanent and global — no dispose or ref-counting.
   * Deduplicates by content hash (family + descriptors).
   */
  fontFace(
    family: string,
    descriptors: FontFaceDescriptors,
    options?: { root?: Document | ShadowRoot },
  ): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    const hash = fontFaceContentHash(family, descriptors);

    if (registry.injectedFontFaces.has(hash)) {
      return;
    }

    const rule: StyleRule = {
      selector: '@font-face',
      declarations: formatFontFaceDeclarations(family, descriptors),
    } as StyleRule;

    const info = this.sheetManager.insertGlobalRule(
      registry,
      [rule],
      `fontface:${hash}`,
      root,
    );

    if (info) {
      registry.injectedFontFaces.add(hash);
    }
  }

  /**
   * Inject a CSS @counter-style rule.
   *
   * Permanent and global — no dispose or ref-counting.
   * Deduplicates by name (first definition wins).
   */
  counterStyle(
    name: string,
    descriptors: CounterStyleDescriptors,
    options?: { root?: Document | ShadowRoot },
  ): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    if (registry.injectedCounterStyles.has(name)) {
      return;
    }

    const rule: StyleRule = {
      selector: `@counter-style ${name}`,
      declarations: formatCounterStyleDeclarations(descriptors),
    } as StyleRule;

    const info = this.sheetManager.insertGlobalRule(
      registry,
      [rule],
      `counterstyle:${name}`,
      root,
    );

    if (info) {
      registry.injectedCounterStyles.add(name);
    }
  }

  /**
   * Inject keyframes and return object with toString() and dispose()
   *
   * Keyframes are cached by content (steps). If the same content is injected
   * multiple times with different provided names, the first injected name is reused.
   *
   * If the same name is provided with different content (collision), a unique
   * name is generated to avoid overwriting the existing keyframes.
   */
  keyframes(
    steps: KeyframesSteps,
    nameOrOptions?: string | { root?: Document | ShadowRoot; name?: string },
  ): KeyframesResult {
    // Parse parameters
    const isStringName = typeof nameOrOptions === 'string';
    const providedName = isStringName ? nameOrOptions : nameOrOptions?.name;
    const root = isStringName ? document : nameOrOptions?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    if (Object.keys(steps).length === 0) {
      return {
        toString: () => '',
        dispose: () => {
          /* noop */
        },
      };
    }

    // Generate content-based cache key (independent of provided name)
    const contentHash = JSON.stringify(steps);

    // Check if this exact content is already cached
    const existing = registry.keyframesCache.get(contentHash);
    if (existing) {
      existing.refCount++;
      return {
        toString: () => existing.name,
        dispose: () => this.disposeKeyframes(contentHash, registry),
      };
    }

    // Determine the actual name to use
    let actualName: string;

    if (providedName) {
      // Check if this name is already used with different content
      const existingContentForName =
        registry.keyframesNameToContent.get(providedName);

      if (existingContentForName && existingContentForName !== contentHash) {
        // Name collision: same name, different content
        // Generate a unique name to avoid overwriting
        actualName = `${providedName}-k${registry.keyframesCounter++}`;
      } else {
        // Name is available or used with same content
        actualName = providedName;
        // Track this name -> content mapping
        registry.keyframesNameToContent.set(providedName, contentHash);
      }
    } else {
      // No name provided, generate one
      actualName = `k${registry.keyframesCounter++}`;
    }

    // Insert keyframes
    const result = this.sheetManager.insertKeyframes(
      registry,
      steps,
      actualName,
      root,
    );
    if (!result) {
      return {
        toString: () => '',
        dispose: () => {
          /* noop */
        },
      };
    }

    const { info, declarations } = result;

    // Auto-register @property for custom properties found in keyframe declarations
    if (this.config.autoPropertyTypes !== false && declarations) {
      const resolver = registry.propertyTypeResolver;
      resolver.scanDeclarations(
        declarations,
        (name) => registry.injectedProperties.has(name),
        (name, syntax, initialValue) => {
          this.property(name, {
            syntax,
            inherits: true,
            initialValue,
            root,
          });
        },
      );
    }

    // Cache the result by content hash
    registry.keyframesCache.set(contentHash, {
      name: actualName,
      refCount: 1,
      info,
    });

    // Update metrics
    if (registry.metrics) {
      registry.metrics.totalInsertions++;
      registry.metrics.misses++;
    }

    return {
      toString: () => actualName,
      dispose: () => this.disposeKeyframes(contentHash, registry),
    };
  }

  /**
   * Dispose keyframes
   */
  private disposeKeyframes(contentHash: string, registry: RootRegistry): void {
    const entry = registry.keyframesCache.get(contentHash);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      // Dispose immediately - keyframes are global and safe to clean up right away
      this.sheetManager.deleteKeyframes(registry, entry.info);
      registry.keyframesCache.delete(contentHash);

      // Clean up name-to-content mapping if this name was tracked
      // Find and remove the mapping for this content hash
      for (const [name, hash] of registry.keyframesNameToContent.entries()) {
        if (hash === contentHash) {
          registry.keyframesNameToContent.delete(name);
          break;
        }
      }

      // Update metrics
      if (registry.metrics) {
        registry.metrics.totalUnused++;
        registry.metrics.stylesCleanedUp++;
      }
    }
  }

  // =========================================================================
  // GC: popularity-aware garbage collection with DOM safety guard
  // =========================================================================

  private static readonly TOUCH_THROTTLE_MS = 5_000;
  private static readonly TASTY_CLASS_RE = /^t\d+$/;

  /**
   * Record a render-time usage hit for one or more classNames.
   * Handles space-separated multi-chunk classNames.
   * No-op on the server.
   */
  touch(className: string, options?: { root?: Document | ShadowRoot }): void {
    if (typeof document === 'undefined') return;
    if (!this.config.gc) return;

    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    const now = Date.now();

    const parts =
      className.indexOf(' ') === -1 ? [className] : className.split(' ');

    for (const cls of parts) {
      if (!StyleInjector.TASTY_CLASS_RE.test(cls)) continue;
      if (!registry.rules.has(cls)) continue;

      const entry = registry.usageMap.get(cls);
      if (entry) {
        entry.hitCount++;
        if (now - entry.lastUsedAt > StyleInjector.TOUCH_THROTTLE_MS) {
          entry.lastUsedAt = now;
        }
      } else {
        registry.usageMap.set(cls, { hitCount: 1, lastUsedAt: now });
      }
    }
  }

  /**
   * Synchronous garbage collection.
   *
   * 1. Scans the DOM for live tasty classNames (safety guard).
   * 2. Scores each non-live className via popularity-weighted TTL.
   * 3. Marks evictable styles with refCount = 0 and deletes them.
   * 4. Optionally enforces a hard `cacheCapacity` cap.
   *
   * @returns Number of styles evicted.
   */
  gc(options?: GCOptions): number {
    if (typeof document === 'undefined') return 0;

    // Cancel any pending idle-scheduled GC to prevent double runs
    if (this.pendingGCHandle != null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.pendingGCHandle);
      }
      this.pendingGCHandle = null;
    }

    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    const baseMaxAge =
      options?.baseMaxAge ?? this.config.gc?.baseMaxAge ?? 60_000;
    const cacheCapacity =
      options?.cacheCapacity ?? this.config.gc?.cacheCapacity;
    const now = Date.now();

    // Phase 0: scan DOM for live classes (classList handles SVG elements too)
    const liveClasses = new Set<string>();
    for (const el of root.querySelectorAll('[class]')) {
      for (const token of el.classList) {
        if (StyleInjector.TASTY_CLASS_RE.test(token)) {
          liveClasses.add(token);
        }
      }
    }

    let swept = 0;

    // Phase 1: score-based eviction (skip live and actively-referenced classes)
    for (const [className, usage] of registry.usageMap) {
      if (liveClasses.has(className)) continue;
      if ((registry.refCounts.get(className) ?? 0) > 0) continue;

      const age = now - usage.lastUsedAt;
      const effectiveTTL = baseMaxAge * Math.log2(usage.hitCount + 1);

      if (age > effectiveTTL) {
        registry.usageMap.delete(className);
        swept++;
      }
    }

    // Phase 2: capacity cap (evict lowest-scored non-live, non-referenced styles)
    if (cacheCapacity && registry.usageMap.size > cacheCapacity) {
      const scored: { className: string; score: number }[] = [];
      for (const [className, usage] of registry.usageMap) {
        if (liveClasses.has(className)) continue;
        if ((registry.refCounts.get(className) ?? 0) > 0) continue;
        const age = now - usage.lastUsedAt;
        scored.push({
          className,
          score: usage.hitCount * Math.exp(-age / baseMaxAge),
        });
      }

      if (scored.length > 0) {
        scored.sort((a, b) => a.score - b.score);

        const toEvict = registry.usageMap.size - cacheCapacity;
        for (let i = 0; i < Math.min(toEvict, scored.length); i++) {
          const { className } = scored[i];
          registry.usageMap.delete(className);
          swept++;
        }
      }
    }

    if (swept > 0) {
      this.sheetManager.forceCleanup(registry);
    }

    this.lastGCTime = Date.now();

    return swept;
  }

  /**
   * Event-driven GC with cooldown.
   * Skips if called within `cooldown` ms of the last run.
   * Schedules the actual GC via `requestIdleCallback` when available.
   */
  maybeGC(options?: GCOptions): void {
    if (typeof document === 'undefined') return;

    const cooldown = this.config.gc?.cooldown ?? 30_000;
    const now = Date.now();

    if (now - this.lastGCTime < cooldown) return;

    // Set before scheduling to prevent multiple idle callbacks from stacking
    // when maybeGC is called rapidly (e.g. on every route change).
    this.lastGCTime = now;

    if (typeof requestIdleCallback !== 'undefined') {
      this.pendingGCHandle = requestIdleCallback(() => {
        this.pendingGCHandle = null;
        this.gc(options);
      });
    } else {
      this.gc(options);
    }
  }

  /**
   * Destroy all resources for a root
   */
  destroy(root?: Document | ShadowRoot): void {
    const targetRoot = root || document;
    this.sheetManager.cleanup(targetRoot);

    // Clear sweep timer and pending GC only when no active roots remain
    if (this.backgroundSweepTimeout && !this.sheetManager.hasActiveRoots()) {
      clearTimeout(this.backgroundSweepTimeout);
      this.backgroundSweepTimeout = null;

      if (this.pendingGCHandle != null) {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(this.pendingGCHandle);
        }
        this.pendingGCHandle = null;
      }
    }
  }
}
