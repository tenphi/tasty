/**
 * Style injector that works with structured style objects
 * Eliminates CSS string parsing for better performance
 */

import type { StyleResult } from '../pipeline';
import {
  getEffectiveDefinition,
  normalizePropertyDefinition,
} from '../properties';
import {
  colorInitialValueToComponents,
  getColorSpaceSuffix,
  getComponentPropertySyntax,
} from '../utils/color-space';
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

import { SheetManager } from './sheet-manager';
import { fontFaceContentHash, formatFontFaceDeclarations } from '../font-face';
import { formatCounterStyleDeclarations } from '../counter-style';
import {
  formatFunctionDeclarations,
  formatFunctionPrelude,
  parseFunctionName,
} from '../functions';
import { HYDRATED_RULE_INDEX, PLACEHOLDER_RULE_INDEX } from './types';
import type {
  CacheMetrics,
  CounterStyleDescriptors,
  FontFaceDescriptors,
  FunctionDefinition,
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
          `[tasty] Hash collision: cache keys produce the same class "${className}". Styles may be incorrect.`,
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
    let isPreAllocated = false;

    if (cacheKey && registry.cacheKeyToClassName.has(cacheKey)) {
      // Reuse existing class for this cache key
      className = registry.cacheKeyToClassName.get(cacheKey)!;
      const existingRuleInfo = registry.rules.get(className)!;

      // Check if this is a placeholder (pre-allocated but not yet injected)
      isPreAllocated =
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

    // For color tokens, also register the decomposed-components companion
    // (`--{name}-color-{colorSpace}`) so it can be transitioned/animated and
    // referenced as a single design-system token. Mirrors the SSR formatter
    // in `src/ssr/format-property.ts`.
    if (effectiveResult.isColor) {
      const suffix = getColorSpaceSuffix();
      const companionCssName = `${cssName}-${suffix}`;
      const companionDefinition: PropertyDefinition = {
        syntax: getComponentPropertySyntax(),
        inherits: definition.inherits,
        initialValue: colorInitialValueToComponents(definition.initialValue),
      };
      this.insertPropertyRule(
        registry,
        root,
        companionCssName,
        companionDefinition,
        `${name}:components`,
      );
    }
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

    this.sheetManager.insertGlobalRule(
      registry,
      [rule],
      `property:${cacheKey}`,
      root,
    );
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
      this.sheetManager.deleteGlobalRule(registry, `counterstyle:${name}`);
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
      registry.injectedCounterStyles.set(name, !isWeak);
    }
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
      this.sheetManager.deleteGlobalRule(registry, `function:${cssName}`);
    }

    const rule: StyleRule = {
      selector: formatFunctionPrelude(
        name,
        definition.args,
        definition.returns,
      ),
      declarations: formatFunctionDeclarations(definition),
    } as StyleRule;

    const info = this.sheetManager.insertGlobalRule(
      registry,
      [rule],
      `function:${cssName}`,
      root,
    );

    if (info) {
      registry.injectedFunctions.set(cssName, !isWeak);
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
