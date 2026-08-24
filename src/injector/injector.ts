/**
 * Style injector that works with structured style objects
 * Eliminates CSS string parsing for better performance
 */

import type { StyleResult } from '../pipeline';
import {
  getEffectiveDefinition,
  normalizePropertyDefinition,
} from '../properties';
import { hashString } from '../utils/hash';
import { isDevEnv } from '../utils/is-dev-env';
import {
  DEFAULT_NAME_PREFIX,
  makeClassName,
  makeKeyframeName,
  rscClassRegexGlobal,
  tastyClassRegex,
  validateNamePrefix,
} from '../utils/name-prefix';
import type { StyleValue } from '../utils/styles';
import { parseStyle } from '../utils/styles';

import {
  enqueueStyleWrite,
  flushStyles,
  isBatchWindowOpen,
  warnBatchProviderMissing,
} from './batch';
import type { QueuedWrite } from './batch';
import { SheetManager } from './sheet-manager';
import { fontFaceContentHash, formatFontFaceDeclarations } from '../font-face';
import { formatCounterStyleDeclarations } from '../counter-style';
import {
  formatFunctionDeclarations,
  formatFunctionPrelude,
  parseFunctionName,
} from '../functions';
import {
  HYDRATED_RULE_INDEX,
  PENDING_RULE_INDEX,
  PLACEHOLDER_RULE_INDEX,
} from './types';
import type {
  CacheMetrics,
  CounterStyleDescriptors,
  FontFaceDescriptors,
  FunctionDefinition,
  GCOptions,
  GlobalInjectResult,
  InjectResult,
  KeyframesCacheEntry,
  KeyframesInfo,
  KeyframesResult,
  KeyframesSteps,
  PropertyDefinition,
  RawCSSResult,
  RootRegistry,
  RuleInfo,
  StyleInjectorConfig,
  StyleRule,
} from './types';

/**
 * Placeholder `KeyframesInfo` for a cache entry reserved by a batched write and
 * not yet backed by a real rule. Only ever read through `entry.pending`, which
 * is checked before the info is used.
 */
const EMPTY_KEYFRAMES_INFO = {
  name: '',
  ruleIndex: PENDING_RULE_INDEX,
  sheetIndex: PENDING_RULE_INDEX,
} as unknown as KeyframesInfo;

/**
 * Extract class names from `<style data-tasty-rsc>` tags.
 * The doubled-specificity pattern `.tXXX.tXXX` makes extraction reliable.
 */
function extractRSCClassNames(rscClassRegex: RegExp): string[] {
  if (typeof document === 'undefined') return [];
  const styles = document.querySelectorAll('style[data-tasty-rsc]');
  if (styles.length === 0) return [];

  const classSet = new Set<string>();
  for (const style of styles) {
    const text = style.textContent;
    if (!text) continue;
    let match: RegExpExecArray | null;
    rscClassRegex.lastIndex = 0;
    while ((match = rscClassRegex.exec(text)) !== null) {
      classSet.add(match[1]);
    }
  }
  return Array.from(classSet);
}

/**
 * Lazily sync server-rendered class names into the client registry.
 *
 * Sources:
 * 1. `window.__TASTY__` — pushed by SSR/RSC streaming scripts
 * 2. `<style data-tasty-rsc>` tags — inline CSS emitted by RSC components
 *
 * Called inside `inject()` / `allocateClassName()` to pick up
 * class names rendered on the server (including during SPA navigation).
 */
function syncServerClasses(
  registry: RootRegistry,
  rscClassRegex: RegExp,
): void {
  if (typeof window === 'undefined') return;

  // Source 1: window.__TASTY__ (SSR streaming scripts)
  const classes = window.__TASTY__;
  if (classes && classes.length > registry.serverClassSyncIndex) {
    for (let i = registry.serverClassSyncIndex; i < classes.length; i++) {
      registerHydratedClass(registry, classes[i]);
    }
    registry.serverClassSyncIndex = classes.length;
  }

  // Source 2: <style data-tasty-rsc> tags (RSC inline styles)
  if (!registry.rscStylesScanned) {
    registry.rscStylesScanned = true;
    for (const cls of extractRSCClassNames(rscClassRegex)) {
      registerHydratedClass(registry, cls);
    }
  }
}

function registerHydratedClass(
  registry: RootRegistry,
  className: string,
): void {
  if (registry.rules.has(className)) return;
  registry.rules.set(className, {
    className,
    ruleIndex: HYDRATED_RULE_INDEX,
    sheetIndex: HYDRATED_RULE_INDEX,
  });
  registry.refCounts.set(className, 0);
}

export class StyleInjector {
  private sheetManager: SheetManager;
  private config: StyleInjectorConfig;
  private globalRuleCounter = 0;
  private pendingGCHandle: ReturnType<typeof requestIdleCallback> | null = null;
  private namePrefix: string;
  private classRegex: RegExp;
  private rscClassRegex: RegExp;

  /** @internal — exposed for debug utilities only */
  get _sheetManager(): SheetManager {
    return this.sheetManager;
  }

  /**
   * Whether sheet writes should be queued instead of applied immediately.
   *
   * Only ever true on the client: SSR collects CSS as text and the RSC path
   * returns it as strings, so neither has a live sheet to batch writes against.
   *
   * In the default `true` mode a write is only queued inside an open batch
   * window — a commit in which `<TastyBatchProvider>` rendered and will
   * therefore flush in its insertion effect, before any layout effect can
   * measure. Everything else falls through to a synchronous write, so enabling
   * the flag cannot make a `useLayoutEffect` read an unstyled element.
   * `'always'` drops the gate and accepts that trade for wider coverage.
   */
  private get batching(): boolean {
    const mode = this.config.batchInjection;
    if (!mode || typeof document === 'undefined') return false;
    if (mode === 'always') return true;
    if (isBatchWindowOpen()) return true;
    warnBatchProviderMissing();
    return false;
  }

  /**
   * Apply a sheet write now, or queue it when batching is on.
   * Returns the queue handle when deferred, so the caller can cancel it if it
   * disposes before the flush.
   */
  private writeSheet(task: () => void): QueuedWrite | null {
    if (this.batching) return enqueueStyleWrite(task);
    task();
    return null;
  }

  /**
   * Insert a global (non-class) rule, honouring batching.
   *
   * `onApplied` records the caller's dedupe bookkeeping. When the write is
   * queued it runs eagerly, so a repeat call before the flush bails out instead
   * of queueing the same rule twice — the same reasoning as
   * `insertPropertyRule`'s eager marking. When written synchronously it runs
   * only on success, preserving the existing retry-on-failure behaviour.
   */
  private writeGlobalRule(
    registry: RootRegistry,
    rules: StyleRule[],
    key: string,
    root: Document | ShadowRoot,
    onApplied?: () => void,
  ): void {
    if (this.batching) {
      onApplied?.();
      enqueueStyleWrite(() => {
        this.sheetManager.insertGlobalRule(registry, rules, key, root);
      });
      return;
    }
    const info = this.sheetManager.insertGlobalRule(registry, rules, key, root);
    if (info) onApplied?.();
  }

  constructor(config: StyleInjectorConfig = {}) {
    if (config.namePrefix !== undefined) {
      validateNamePrefix(config.namePrefix);
    }
    this.config = config;
    this.sheetManager = new SheetManager(config);
    this.namePrefix = config.namePrefix ?? DEFAULT_NAME_PREFIX;
    this.classRegex = tastyClassRegex(this.namePrefix);
    this.rscClassRegex = rscClassRegexGlobal(this.namePrefix);
  }

  /**
   * Generate a deterministic class name from a cache key using content hash.
   * The same cache key always produces the same class name across environments
   * with the same `namePrefix`.
   */
  private generateClassName(cacheKey: string): string {
    return makeClassName(this.namePrefix, hashString(cacheKey));
  }

  /**
   * Check if `className` was hydrated from server-rendered styles and,
   * if so, wire the cacheKey mapping. Returns true on hit.
   */
  private tryHydratedHit(
    registry: RootRegistry,
    cacheKey: string,
    className: string,
  ): boolean {
    syncServerClasses(registry, this.rscClassRegex);
    const rule = registry.rules.get(className);
    if (
      rule &&
      rule.ruleIndex === HYDRATED_RULE_INDEX &&
      rule.sheetIndex === HYDRATED_RULE_INDEX
    ) {
      registry.cacheKeyToClassName.set(cacheKey, className);
      return true;
    }
    return false;
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

    // Generate deterministic className from cache key
    const className = this.generateClassName(cacheKey);

    // Check if this className was hydrated from server-rendered styles
    if (this.tryHydratedHit(registry, cacheKey, className)) {
      return { className, isNewAllocation: false };
    }

    // Hash collision guard: another cache key already owns this class name
    const existingRule = registry.rules.get(className);
    if (existingRule) {
      if (isDevEnv()) {
        console.warn(
          `[Tasty] Hash collision: cache keys produce the same class "${className}". Styles may be incorrect.`,
        );
      }
      // Treat as already allocated to avoid overwriting
      registry.cacheKeyToClassName.set(cacheKey, className);
      return { className, isNewAllocation: false };
    }

    // Create placeholder RuleInfo to reserve the className
    const placeholderRuleInfo = {
      className,
      ruleIndex: PLACEHOLDER_RULE_INDEX,
      sheetIndex: PLACEHOLDER_RULE_INDEX,
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

    if (cacheKey && registry.cacheKeyToClassName.has(cacheKey)) {
      // Reuse existing class for this cache key
      className = registry.cacheKeyToClassName.get(cacheKey)!;
      const existingRuleInfo = registry.rules.get(className)!;

      // Rules are already queued for a batched write. Bump the refCount and let
      // the queued write land — injecting again would duplicate every rule.
      if (existingRuleInfo.ruleIndex === PENDING_RULE_INDEX) {
        registry.refCounts.set(
          className,
          (registry.refCounts.get(className) || 0) + 1,
        );

        if (registry.metrics) {
          registry.metrics.hits++;
        }

        return {
          className,
          dispose: () => this.dispose(className, registry),
        };
      }

      // A placeholder means the class name was pre-allocated but its CSS was
      // never injected, so fall through and inject it now. Anything else is
      // already in a sheet.
      const isPreAllocated =
        existingRuleInfo.ruleIndex === PLACEHOLDER_RULE_INDEX &&
        existingRuleInfo.sheetIndex === PLACEHOLDER_RULE_INDEX;

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
    } else if (cacheKey) {
      // Generate deterministic className from cache key
      className = this.generateClassName(cacheKey);

      // Check if this className was hydrated from server-rendered styles
      if (this.tryHydratedHit(registry, cacheKey, className)) {
        registry.refCounts.set(
          className,
          (registry.refCounts.get(className) || 0) + 1,
        );

        if (registry.metrics) {
          registry.metrics.hits++;
        }

        return {
          className,
          dispose: () => this.dispose(className, registry),
        };
      }
    } else {
      // No cache key — generate from rules content
      const parts = rules.map((r) => `${r.selector}\0${r.declarations}`);
      className = makeClassName(this.namePrefix, hashString(parts.join('\n')));
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

    // The sheet write, plus the `@property` auto-registration that the rules'
    // declarations may trigger. Kept together in one closure so batching moves
    // them as a unit and the sheet ends up in the same order either way.
    const applySheetWrite = (): RuleInfo | null => {
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
        return null;
      }

      // Store in registry. Setting the cacheKey mapping is idempotent when the
      // class was pre-allocated, so both paths can share one branch.
      registry.rules.set(className, ruleInfo);
      if (cacheKey) {
        registry.cacheKeyToClassName.set(cacheKey, className);
      }

      // Update metrics
      if (registry.metrics) {
        registry.metrics.totalInsertions++;
        registry.metrics.misses++;
      }

      return ruleInfo;
    };

    if (this.batching) {
      // Reserve the class name before returning so a repeat inject() with the
      // same cacheKey — very common, one per sibling component — takes the
      // PENDING short-circuit above instead of queueing the same rules again.
      registry.rules.set(className, {
        className,
        ruleIndex: PENDING_RULE_INDEX,
        sheetIndex: PENDING_RULE_INDEX,
      });
      if (cacheKey) {
        registry.cacheKeyToClassName.set(cacheKey, className);
      }
      registry.refCounts.set(className, 1);

      const queued = enqueueStyleWrite(() => {
        if (applySheetWrite()) return;
        // Insertion failed. Fall back to the "allocated but not injected"
        // state so a later render retries, matching the unbatched path.
        registry.rules.set(className, {
          className,
          ruleIndex: PLACEHOLDER_RULE_INDEX,
          sheetIndex: PLACEHOLDER_RULE_INDEX,
        });
      });

      return {
        className,
        dispose: () => {
          // Still queued and this was the only owner: drop the write and the
          // reservation rather than leaving an orphan rule for GC to find.
          if (
            !queued.done &&
            registry.refCounts.get(className) === 1 &&
            registry.rules.get(className)?.ruleIndex === PENDING_RULE_INDEX
          ) {
            queued.cancelled = true;
            registry.rules.delete(className);
            if (cacheKey) {
              registry.cacheKeyToClassName.delete(cacheKey);
            }
            registry.refCounts.set(className, 0);
            return;
          }
          this.dispose(className, registry);
        },
      };
    }

    if (!applySheetWrite()) {
      return {
        className,
        dispose: () => {
          /* noop */
        },
      };
    }

    registry.refCounts.set(className, 1);

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

    // Use a non-tasty identifier to avoid any collisions with .t{number} classes
    const key = `global:${this.globalRuleCounter++}`;

    // The `@property` auto-registration inserts rules of its own, so it stays in
    // the same queue slot as the rules that triggered it. Global rules are style
    // rules and do take part in the cascade, so they share the one FIFO with
    // component rules — that is what keeps sheet order identical to unbatched
    // output, and equal-specificity rules resolve by document order.
    const applyWrite = (): RuleInfo | null => {
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

      const inserted = this.sheetManager.insertGlobalRule(
        registry,
        rules as unknown as StyleRule[],
        key,
        root,
      );

      if (registry.metrics) {
        registry.metrics.totalInsertions++;
      }

      return inserted;
    };

    if (this.batching) {
      let info: RuleInfo | null = null;
      const queued = enqueueStyleWrite(() => {
        info = applyWrite();
      });

      return {
        dispose: () => {
          // Cancel instead of deleting a rule that never made it into a sheet.
          if (!queued.done) {
            queued.cancelled = true;
            return;
          }
          if (info) this.sheetManager.deleteGlobalRule(registry, key);
        },
      };
    }

    const info = applyWrite();

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

    if (!this.batching) {
      return this.sheetManager.injectRawCSS(css, root);
    }

    // Raw CSS is arbitrary and does take part in the cascade, so it goes through
    // the same FIFO as component and global rules.
    let result: RawCSSResult | null = null;
    const queued = enqueueStyleWrite(() => {
      result = this.sheetManager.injectRawCSS(css, root);
    });

    return {
      dispose: () => {
        if (!queued.done) {
          queued.cancelled = true;
          return;
        }
        result?.dispose();
      },
    };
  }

  /**
   * Get raw CSS text for SSR
   */
  getRawCSSText(options?: { root?: Document | ShadowRoot }): string {
    flushStyles();
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
    flushStyles();
    const registry = this.sheetManager.getRegistry(root || document);
    // Clean up ALL unused rules regardless of batch ratio
    this.sheetManager.forceCleanup(registry);
  }

  /**
   * Get CSS text from all sheets (for SSR)
   */
  getCSSText(options?: { root?: Document | ShadowRoot }): string {
    flushStyles();
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    return this.sheetManager.getCSSText(registry);
  }

  /**
   * Get CSS only for the provided tasty classNames (e.g., ["t0","t3"])
   */
  getCSSTextForClasses(
    classNames: Iterable<string>,
    options?: { root?: Document | ShadowRoot },
  ): string {
    flushStyles();
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);

    const cssChunks: string[] = [];
    for (const cls of classNames) {
      const info = registry.rules.get(cls);
      if (info) {
        // Always prefer reading from the live stylesheet, since indices can change
        const sheet = registry.sheets[info.sheetIndex];
        const styleSheet = sheet ? this.sheetManager.getCSSSheet(sheet) : null;
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
    // Batched insertions only count themselves once they reach a sheet, so a read
    // taken mid-window would report a torn picture: `hits` already advanced,
    // `totalInsertions` not yet.
    flushStyles();
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

    this.insertPropertyRule(registry, root, cssName, definition, name);
  }

  /**
   * Build and insert a single `@property` rule into the given registry.
   * No-op if the property was already injected.
   */
  private insertPropertyRule(
    registry: RootRegistry,
    root: Document | ShadowRoot,
    cssName: string,
    definition: PropertyDefinition,
    cacheKey: string,
  ): void {
    if (registry.injectedProperties.has(cssName)) {
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

    // Mark as attempted BEFORE inserting so repeated calls bail early even
    // when the insertion ultimately fails (e.g., engines like jsdom that
    // don't support @property reject every @property rule unconditionally).
    // Without this, every render's auto-property scan would re-attempt the
    // same rejected rules and flood the console with warnings.
    registry.injectedProperties.set(
      cssName,
      normalizePropertyDefinition(definition),
    );

    this.writeGlobalRule(registry, [rule], `property:${cacheKey}`, root);
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
    flushStyles();
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

    this.writeGlobalRule(registry, [rule], `fontface:${hash}`, root, () => {
      registry.injectedFontFaces.add(hash);
    });
  }

  /**
   * Inject a CSS @counter-style rule.
   *
   * Permanent and global — no dispose or ref-counting. Deduplicates by name.
   * By default a definition overrides a previously injected one of the same
   * name. Pass `weak: true` for global `configure()` definitions, which must
   * never clobber an existing rule (so component-local definitions win
   * regardless of injection order).
   */
  counterStyle(
    name: string,
    descriptors: CounterStyleDescriptors,
    options?: { root?: Document | ShadowRoot; weak?: boolean },
  ): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    const isWeak = options?.weak === true;

    const existingIsStrong = registry.injectedCounterStyles.get(name);
    if (existingIsStrong !== undefined) {
      // A weak (global) definition never overrides; a strong one keeps the
      // first definition. Only a strong definition replacing a weak one wins.
      if (isWeak || existingIsStrong === true) {
        return;
      }
      this.writeSheet(() => {
        this.sheetManager.deleteGlobalRule(registry, `counterstyle:${name}`);
      });
    }

    const rule: StyleRule = {
      selector: `@counter-style ${name}`,
      declarations: formatCounterStyleDeclarations(descriptors),
    } as StyleRule;

    this.writeGlobalRule(registry, [rule], `counterstyle:${name}`, root, () => {
      registry.injectedCounterStyles.set(name, !isWeak);
    });
  }

  /**
   * Inject a CSS @function rule (custom function).
   *
   * Permanent and global — no dispose or ref-counting. Deduplicates by function
   * name. By default a definition overrides a previously injected one of the
   * same name. Pass `weak: true` for global `configure()` definitions, which
   * must never clobber an existing rule (so component-local definitions win
   * regardless of injection order).
   */
  func(
    name: string,
    definition: FunctionDefinition,
    options?: { root?: Document | ShadowRoot; weak?: boolean },
  ): void {
    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    const isWeak = options?.weak === true;

    const cssName = parseFunctionName(name);

    const existingIsStrong = registry.injectedFunctions.get(cssName);
    if (existingIsStrong !== undefined) {
      // A weak (global) definition never overrides; a strong one keeps the
      // first definition. Only a strong definition replacing a weak one wins.
      if (isWeak || existingIsStrong === true) {
        return;
      }
      this.writeSheet(() => {
        this.sheetManager.deleteGlobalRule(registry, `function:${cssName}`);
      });
    }

    const rule: StyleRule = {
      selector: formatFunctionPrelude(
        name,
        definition.args,
        definition.returns,
      ),
      declarations: formatFunctionDeclarations(definition),
    } as StyleRule;

    this.writeGlobalRule(registry, [rule], `function:${cssName}`, root, () => {
      registry.injectedFunctions.set(cssName, !isWeak);
    });
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
        actualName = `${providedName}-${makeKeyframeName(
          this.namePrefix,
          String(registry.keyframesCounter++),
        )}`;
      } else {
        // Name is available or used with same content
        actualName = providedName;
        // Track this name -> content mapping
        registry.keyframesNameToContent.set(providedName, contentHash);
      }
    } else {
      // No name provided, generate one
      actualName = makeKeyframeName(
        this.namePrefix,
        String(registry.keyframesCounter++),
      );
    }

    // The insertion plus the `@property` scan over the resulting declarations.
    // Returns false when the sheet rejected the rule, so the caller can leave
    // the cache untouched and let a later call retry.
    const applyWrite = (): boolean => {
      const result = this.sheetManager.insertKeyframes(
        registry,
        steps,
        actualName,
        root,
      );
      if (!result) return false;

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

      const entry = registry.keyframesCache.get(contentHash);
      if (entry) {
        // Batched path: the entry was reserved up front, fill in the real info.
        entry.info = info;
        entry.pending = undefined;
      } else {
        registry.keyframesCache.set(contentHash, {
          name: actualName,
          refCount: 1,
          info,
        });
      }

      // Update metrics
      if (registry.metrics) {
        registry.metrics.totalInsertions++;
        registry.metrics.misses++;
      }

      return true;
    };

    if (this.batching) {
      // Reserve the cache entry now so a second keyframes() call with the same
      // content before the flush reuses the name instead of queueing again.
      // `info` is a placeholder until the write lands; `pending` marks that, and
      // disposeKeyframes() cancels rather than deleting a non-existent rule.
      const entry: KeyframesCacheEntry = {
        name: actualName,
        refCount: 1,
        info: EMPTY_KEYFRAMES_INFO,
      };
      registry.keyframesCache.set(contentHash, entry);

      entry.pending = enqueueStyleWrite(() => {
        if (applyWrite()) return;
        // Rejected: drop the reservation so a later call can retry, mirroring
        // the unbatched path which never caches a failed insertion.
        if (registry.keyframesCache.get(contentHash) === entry) {
          registry.keyframesCache.delete(contentHash);
        }
      });

      return {
        toString: () => actualName,
        dispose: () => this.disposeKeyframes(contentHash, registry),
      };
    }

    if (!applyWrite()) {
      return {
        toString: () => '',
        dispose: () => {
          /* noop */
        },
      };
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
      // Queued but not yet written: cancel the write instead of deleting a rule
      // that was never inserted.
      if (entry.pending && !entry.pending.done) {
        entry.pending.cancelled = true;
      } else {
        // Dispose immediately - keyframes are global and safe to clean up right away
        this.sheetManager.deleteKeyframes(registry, entry.info);
      }
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
  // GC: touch-count-driven garbage collection with DOM safety guard
  // =========================================================================

  /**
   * Record a render-time usage hit for one or more classNames.
   * Handles space-separated multi-chunk classNames.
   * When the global touch counter reaches `touchInterval`, schedules a GC
   * via `requestIdleCallback`.
   * No-op on the server.
   */
  touch(className: string, options?: { root?: Document | ShadowRoot }): void {
    if (typeof document === 'undefined') return;
    if (!this.config.gc) return;

    const root = options?.root || document;
    const registry = this.sheetManager.getRegistry(root);
    const now = Date.now();

    // `touch()` runs on every render of every tasty component — on a fully
    // cached render it is the only work left — and a page typically renders
    // hundreds of components sharing a handful of class names. Everything below
    // stamps `lastTouchedAt` with the millisecond we are already in, so
    // re-touching the same class-name string inside that millisecond writes the
    // value it already holds. Skip it: one Set lookup instead of a split, a
    // regex test and two Map operations per chunk.
    if (registry.touchTick !== now) {
      registry.touchTick = now;
      registry.touchedTick.clear();
    } else if (registry.touchedTick.has(className)) {
      return;
    }
    registry.touchedTick.add(className);

    const parts =
      className.indexOf(' ') === -1 ? [className] : className.split(' ');

    for (const cls of parts) {
      if (!this.classRegex.test(cls)) continue;
      if (!registry.rules.has(cls)) continue;

      const entry = registry.usageMap.get(cls);
      if (entry) {
        entry.lastTouchedAt = now;
      } else {
        registry.usageMap.set(cls, { lastTouchedAt: now });
      }
      registry.touchCount++;
    }

    const touchInterval = this.config.gc.touchInterval ?? 1000;
    if (registry.touchCount >= touchInterval) {
      registry.touchCount = 0;
      this.scheduleGC();
    }
  }

  /**
   * Schedule a GC via `requestIdleCallback` (or synchronously as fallback).
   * Runs GC on all active roots. Avoids double-scheduling via `pendingGCHandle`.
   */
  private scheduleGC(): void {
    if (this.pendingGCHandle != null) return;

    const runGC = () => {
      this.pendingGCHandle = null;
      this.sheetManager.pruneDisconnectedRoots();
      for (const root of this.sheetManager.getActiveRoots()) {
        this.gc({ root });
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      this.pendingGCHandle = requestIdleCallback(() => runGC());
    } else {
      runGC();
    }
  }

  /**
   * Synchronous garbage collection.
   *
   * 1. Quick upper-bound check: skip if unused count can't exceed capacity.
   * 2. Scans the DOM for live tasty classNames (safety guard).
   * 3. With `force: true`: deletes all unused entries inline.
   *    Without `force`: collects unused, sorts oldest-first, evicts over capacity.
   *
   * @returns Number of styles evicted.
   */
  gc(options?: GCOptions): number {
    // Pending writes still carry PENDING sentinels in `registry.rules`; sweeping
    // those would corrupt sheet indices, so land every write first.
    flushStyles();
    if (typeof document === 'undefined') return 0;

    // Cancel any pending idle-scheduled GC to prevent double runs
    if (this.pendingGCHandle != null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.pendingGCHandle);
      }
      this.pendingGCHandle = null;
    }

    const root = options?.root || document;
    const force = options?.force ?? false;
    const registry = this.sheetManager.getRegistry(root);
    const capacity = this.config.gc?.capacity ?? 1000;

    // Quick upper-bound check: count active refs to see if there could
    // possibly be enough unused entries to exceed capacity.
    // This avoids the expensive DOM scan when most styles are active.
    if (!force) {
      let activeCount = 0;
      for (const refCount of registry.refCounts.values()) {
        if (refCount > 0) activeCount++;
      }
      if (registry.usageMap.size - activeCount <= capacity) {
        return 0;
      }
    }

    // Scan DOM for live classes (classList handles SVG elements too)
    const liveClasses = new Set<string>();
    for (const el of root.querySelectorAll('[class]')) {
      for (const token of el.classList) {
        if (this.classRegex.test(token)) {
          liveClasses.add(token);
        }
      }
    }

    let swept = 0;

    if (force) {
      for (const [className] of registry.usageMap) {
        if (liveClasses.has(className)) continue;
        if ((registry.refCounts.get(className) ?? 0) > 0) continue;
        registry.usageMap.delete(className);
        swept++;
      }
    } else {
      const unused: { className: string; lastTouchedAt: number }[] = [];
      for (const [className, usage] of registry.usageMap) {
        if (liveClasses.has(className)) continue;
        if ((registry.refCounts.get(className) ?? 0) > 0) continue;
        unused.push({ className, lastTouchedAt: usage.lastTouchedAt });
      }

      if (unused.length > capacity) {
        unused.sort((a, b) => a.lastTouchedAt - b.lastTouchedAt);
        const toEvict = unused.length - capacity;
        for (let i = 0; i < toEvict; i++) {
          registry.usageMap.delete(unused[i].className);
          swept++;
        }
      }
    }

    if (swept > 0) {
      this.sheetManager.forceCleanup(registry);
    }

    return swept;
  }

  /**
   * Destroy all resources for a root
   */
  destroy(root?: Document | ShadowRoot): void {
    flushStyles();
    const targetRoot = root || document;
    this.sheetManager.cleanup(targetRoot);

    // Clear pending GC when no active roots remain
    if (this.pendingGCHandle != null && !this.sheetManager.hasActiveRoots()) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.pendingGCHandle);
      }
      this.pendingGCHandle = null;
    }
  }
}
