import { PropertyTypeResolver } from '../properties/property-type-resolver';
import { createStyle, STYLE_HANDLER_MAP } from '../styles';

import type {
  CacheMetrics,
  InjectionMode,
  KeyframesInfo,
  KeyframesSteps,
  RawCSSInfo,
  RawCSSResult,
  RootRegistry,
  RuleInfo,
  SheetInfo,
  StyleInjectorConfig,
  StyleRule,
} from './types';

import type { CSSMap, StyleHandler, StyleValueStateMap } from '../utils/styles';

const supportsConstructableSheets =
  typeof CSSStyleSheet !== 'undefined' &&
  (() => {
    try {
      new CSSStyleSheet();
      return true;
    } catch {
      return false;
    }
  })();

export class SheetManager {
  private rootRegistries = new WeakMap<Document | ShadowRoot, RootRegistry>();
  /** Strong set of active roots so background GC can iterate them all */
  private activeRoots = new Set<Document | ShadowRoot>();
  private config: StyleInjectorConfig;
  /** Dedicated style elements for raw CSS per root */
  private rawStyleElements = new WeakMap<
    Document | ShadowRoot,
    HTMLStyleElement
  >();
  /** Constructable sheets for raw CSS in adopted mode */
  private rawConstructableSheets = new WeakMap<ShadowRoot, CSSStyleSheet>();
  /** Tracking for raw CSS blocks per root */
  private rawCSSBlocks = new WeakMap<
    Document | ShadowRoot,
    Map<string, RawCSSInfo>
  >();
  /** Counter for generating unique raw CSS IDs */
  private rawCSSCounter = 0;

  constructor(config: StyleInjectorConfig) {
    this.config = config;
  }

  /**
   * Resolve the underlying CSSStyleSheet from a SheetInfo,
   * abstracting away adopted vs style-element modes.
   */
  getCSSSheet(sheetInfo: SheetInfo): CSSStyleSheet | null {
    if (sheetInfo.constructableSheet) return sheetInfo.constructableSheet;
    return sheetInfo.sheet?.sheet ?? null;
  }

  /**
   * Determine the injection mode for a root.
   * ShadowRoot uses adopted stylesheets when supported; Document uses <style> elements.
   */
  private detectInjectionMode(root: Document | ShadowRoot): InjectionMode {
    if (
      root instanceof ShadowRoot &&
      supportsConstructableSheets &&
      !this.config.forceTextInjection
    ) {
      return 'adopted';
    }
    return 'style-element';
  }

  /**
   * Get or create registry for a root (Document or ShadowRoot)
   */
  getRegistry(root: Document | ShadowRoot): RootRegistry {
    let registry = this.rootRegistries.get(root);

    if (!registry) {
      const metrics: CacheMetrics | undefined = this.config.devMode
        ? {
            hits: 0,
            misses: 0,
            bulkCleanups: 0,
            totalInsertions: 0,
            totalUnused: 0,
            stylesCleanedUp: 0,
            cleanupHistory: [],
            startTime: Date.now(),
          }
        : undefined;

      registry = {
        sheets: [],
        refCounts: new Map(),
        rules: new Map(),
        cacheKeyToClassName: new Map(),
        ruleTextSet: new Set<string>(),
        metrics,
        keyframesCache: new Map(),
        keyframesNameToContent: new Map(),
        keyframesCounter: 0,
        injectedProperties: new Map<string, string>(),
        injectedFontFaces: new Set<string>(),
        injectedCounterStyles: new Set<string>(),
        globalRules: new Map(),
        propertyTypeResolver: new PropertyTypeResolver(),
        usageMap: new Map(),
        touchCount: 0,
        serverClassSyncIndex: 0,
        rscStylesScanned: false,
        injectionMode: this.detectInjectionMode(root),
      } as unknown as RootRegistry;

      this.rootRegistries.set(root, registry);
      this.activeRoots.add(root);
    }

    return registry;
  }

  /** Return all roots with active registries (for background GC sweep). */
  getActiveRoots(): Iterable<Document | ShadowRoot> {
    return this.activeRoots;
  }

  /** Check whether any roots have active registries. */
  hasActiveRoots(): boolean {
    return this.activeRoots.size > 0;
  }

  /** Remove registries for ShadowRoots whose host has been detached from the DOM. */
  pruneDisconnectedRoots(): void {
    const toPrune: (Document | ShadowRoot)[] = [];
    for (const root of this.activeRoots) {
      if (root !== document && !(root as ShadowRoot).host?.isConnected) {
        toPrune.push(root);
      }
    }
    for (const root of toPrune) {
      this.cleanup(root);
    }
  }

  /**
   * Create a new stylesheet for the registry.
   * In adopted mode (ShadowRoot), creates a constructable CSSStyleSheet and
   * pushes it to adoptedStyleSheets. Otherwise creates a <style> element.
   */
  createSheet(registry: RootRegistry, root: Document | ShadowRoot): SheetInfo {
    if (registry.injectionMode === 'adopted') {
      const constructableSheet = new CSSStyleSheet();

      // Append after any existing raw CSS sheet
      (root as ShadowRoot).adoptedStyleSheets = [
        ...(root as ShadowRoot).adoptedStyleSheets,
        constructableSheet,
      ];

      const sheetInfo: SheetInfo = {
        sheet: null,
        constructableSheet,
        ruleCount: 0,
        holes: [],
      };

      registry.sheets.push(sheetInfo);
      return sheetInfo;
    }

    const sheet = this.createStyleElement(root);

    const sheetInfo: SheetInfo = {
      sheet,
      ruleCount: 0,
      holes: [],
    };

    registry.sheets.push(sheetInfo);
    return sheetInfo;
  }

  /**
   * Create a style element and append to document
   */
  private createStyleElement(root: Document | ShadowRoot): HTMLStyleElement {
    const style =
      (root as Document).createElement?.('style') ||
      document.createElement('style');

    if (this.config.nonce) {
      style.nonce = this.config.nonce;
    }

    style.setAttribute('data-tasty', '');

    // Append to head or shadow root
    if ('head' in root && root.head) {
      root.head.appendChild(style);
    } else if ('appendChild' in root) {
      root.appendChild(style);
    } else {
      document.head.appendChild(style);
    }

    // Verify it was actually added - log only if there's a problem and we're not using forceTextInjection
    if (!style.isConnected && !this.config.forceTextInjection) {
      console.error('SheetManager: Style element failed to connect to DOM!', {
        parentNode: style.parentNode?.nodeName,
        isConnected: style.isConnected,
      });
    }

    return style;
  }

  /**
   * Insert CSS rules as a single block
   */
  insertRule(
    registry: RootRegistry,
    flattenedRules: StyleRule[],
    className: string,
    root: Document | ShadowRoot,
  ): RuleInfo | null {
    // Find or create a sheet with available space
    let targetSheet = this.findAvailableSheet(registry, root);

    if (!targetSheet) {
      targetSheet = this.createSheet(registry, root);
    }

    const sheetIndex = registry.sheets.indexOf(targetSheet);

    try {
      // Group rules by selector, at-rules, and startingStyle to combine declarations
      const groupedRules: StyleRule[] = [];
      const groupMap = new Map<
        string,
        {
          idx: number;
          selector: string;
          atRules?: string[];
          startingStyle?: boolean;
          declarations: string;
        }
      >();

      const atKey = (at?: string[]) => (at && at.length ? at.join('|') : '');

      flattenedRules.forEach((r) => {
        const key = `${atKey(r.atRules)}||${r.selector}||${r.startingStyle ? '1' : '0'}`;
        const existing = groupMap.get(key);
        if (existing) {
          // Append declarations, preserving order
          existing.declarations = existing.declarations
            ? `${existing.declarations} ${r.declarations}`
            : r.declarations;
        } else {
          groupMap.set(key, {
            idx: groupedRules.length,
            selector: r.selector,
            atRules: r.atRules,
            startingStyle: r.startingStyle,
            declarations: r.declarations,
          });
          groupedRules.push({ ...r });
        }
      });

      // Normalize groupedRules from map (with merged declarations)
      groupMap.forEach((val) => {
        groupedRules[val.idx] = {
          selector: val.selector,
          atRules: val.atRules,
          startingStyle: val.startingStyle,
          declarations: val.declarations,
        } as StyleRule;
      });

      // Insert grouped rules
      const insertedRuleTexts: string[] = [];
      const insertedIndices: number[] = []; // Track exact indices
      // Calculate rule index atomically right before insertion to prevent race conditions
      let currentRuleIndex = this.findAvailableRuleIndex(targetSheet);
      let firstInsertedIndex: number | null = null;
      let lastInsertedIndex: number | null = null;

      for (const rule of groupedRules) {
        const declarations = rule.declarations;
        const innerContent = rule.startingStyle
          ? `@starting-style { ${declarations} }`
          : declarations;
        const baseRule = `${rule.selector} { ${innerContent} }`;

        // Wrap with at-rules if present
        let fullRule = baseRule;
        if (rule.atRules && rule.atRules.length > 0) {
          fullRule = rule.atRules.reduce(
            (css, atRule) => `${atRule} { ${css} }`,
            baseRule,
          );
        }

        // Insert individual rule
        const styleElement = targetSheet.sheet;
        const styleSheet = this.getCSSSheet(targetSheet);

        if (styleSheet && !this.config.forceTextInjection) {
          // Calculate index atomically for each rule to prevent concurrent insertion races
          const maxIndex = styleSheet.cssRules.length;
          const atomicRuleIndex = this.findAvailableRuleIndex(targetSheet);
          const safeIndex = Math.min(Math.max(0, atomicRuleIndex), maxIndex);

          // Helper: split comma-separated selectors safely (ignores commas inside [] () " ')
          const splitSelectorsSafely = (selectorList: string): string[] => {
            const parts: string[] = [];
            let buf = '';
            let depthSq = 0; // [] depth
            let depthPar = 0; // () depth
            let inStr: '"' | "'" | '' = '';
            for (let i = 0; i < selectorList.length; i++) {
              const ch = selectorList[i];
              if (inStr) {
                if (ch === inStr && selectorList[i - 1] !== '\\') {
                  inStr = '';
                }
                buf += ch;
                continue;
              }
              if (ch === '"' || ch === "'") {
                inStr = ch as '"' | "'";
                buf += ch;
                continue;
              }
              if (ch === '[') depthSq++;
              else if (ch === ']') depthSq = Math.max(0, depthSq - 1);
              else if (ch === '(') depthPar++;
              else if (ch === ')') depthPar = Math.max(0, depthPar - 1);

              if (ch === ',' && depthSq === 0 && depthPar === 0) {
                const part = buf.trim();
                if (part) parts.push(part);
                buf = '';
              } else {
                buf += ch;
              }
            }
            const tail = buf.trim();
            if (tail) parts.push(tail);
            return parts;
          };

          try {
            styleSheet.insertRule(fullRule, safeIndex);
            // Update sheet ruleCount immediately to prevent concurrent race conditions
            targetSheet.ruleCount++;
            insertedIndices.push(safeIndex); // Track this index
            if (firstInsertedIndex == null) firstInsertedIndex = safeIndex;
            lastInsertedIndex = safeIndex;
            currentRuleIndex = safeIndex + 1;
          } catch {
            // If the browser rejects the combined selector (e.g., vendor pseudo-elements),
            // try to split and insert each selector independently. Skip unsupported ones.
            const selectors = splitSelectorsSafely(rule.selector);
            if (selectors.length > 1) {
              let anyInserted = false;
              for (const sel of selectors) {
                const singleBase = `${sel} { ${declarations} }`;
                let singleRule = singleBase;
                if (rule.atRules && rule.atRules.length > 0) {
                  singleRule = rule.atRules.reduce(
                    (css, atRule) => `${atRule} { ${css} }`,
                    singleBase,
                  );
                }

                try {
                  // Calculate index atomically for each individual selector insertion
                  const maxIdx = styleSheet.cssRules.length;
                  const atomicIdx = this.findAvailableRuleIndex(targetSheet);
                  const idx = Math.min(Math.max(0, atomicIdx), maxIdx);
                  styleSheet.insertRule(singleRule, idx);
                  // Update sheet ruleCount immediately
                  targetSheet.ruleCount++;
                  insertedIndices.push(idx); // Track this index
                  if (firstInsertedIndex == null) firstInsertedIndex = idx;
                  lastInsertedIndex = idx;
                  currentRuleIndex = idx + 1;
                  anyInserted = true;
                } catch {
                  // Skip unsupported selector in this engine (e.g., ::-moz-selection in Blink).
                  // Silent by design: browser rejections are common and noisy in dev/tests.
                }
              }
              // If none inserted, continue without throwing to avoid aborting the whole batch
              if (!anyInserted) {
                // noop: all selectors invalid here; safe to skip
              }
            } else {
              // Single selector failed — skip silently (likely unsupported in this engine).
              // Browser rejections are common and were too noisy in dev/tests to warn on.
            }
          }
        } else if (styleElement) {
          // Use textContent (either as fallback or when forceTextInjection is enabled)
          // Calculate index atomically for textContent insertion too
          const atomicRuleIndex = this.findAvailableRuleIndex(targetSheet);
          styleElement.textContent =
            (styleElement.textContent || '') + '\n' + fullRule;
          // Update sheet ruleCount immediately
          targetSheet.ruleCount++;
          insertedIndices.push(atomicRuleIndex); // Track this index
          if (firstInsertedIndex == null) firstInsertedIndex = atomicRuleIndex;
          lastInsertedIndex = atomicRuleIndex;
          currentRuleIndex = atomicRuleIndex + 1;
        }

        // CRITICAL DEBUG: Verify the style element is in DOM only if there are issues and we're not using forceTextInjection
        if (
          styleElement &&
          !styleElement.parentNode &&
          !this.config.forceTextInjection
        ) {
          console.error(
            'SheetManager: Style element is NOT in DOM! This is the problem!',
            {
              className,
              ruleIndex: currentRuleIndex,
            },
          );
        }

        // Dev-only: store cssText for debugging tools
        if (this.config.devMode) {
          insertedRuleTexts.push(fullRule);
          try {
            registry.ruleTextSet.add(fullRule);
          } catch {
            // noop: defensive in case ruleTextSet is unavailable
          }
        }
        // currentRuleIndex already adjusted above
      }

      // Sheet ruleCount is now updated immediately after each insertion
      // No need for deferred update logic

      if (insertedIndices.length === 0) {
        return null;
      }

      return {
        className,
        ruleIndex: firstInsertedIndex ?? 0,
        sheetIndex,
        cssText: this.config.devMode ? insertedRuleTexts : undefined,
        endRuleIndex: lastInsertedIndex ?? firstInsertedIndex ?? 0,
        indices: insertedIndices,
      };
    } catch (error) {
      console.warn('Failed to insert CSS rules:', error, {
        flattenedRules,
        className,
      });
      return null;
    }
  }

  /**
   * Insert global CSS rules
   */
  insertGlobalRule(
    registry: RootRegistry,
    flattenedRules: StyleRule[],
    globalKey: string,
    root: Document | ShadowRoot,
  ): RuleInfo | null {
    // Insert the rule using the same mechanism as regular rules
    const ruleInfo = this.insertRule(registry, flattenedRules, globalKey, root);

    // Track global rules for index adjustment
    if (ruleInfo) {
      registry.globalRules.set(globalKey, ruleInfo);
    }

    return ruleInfo;
  }

  /**
   * Delete a global CSS rule by key
   */
  public deleteGlobalRule(registry: RootRegistry, globalKey: string): void {
    const ruleInfo = registry.globalRules.get(globalKey);
    if (!ruleInfo) {
      return;
    }

    // Delete the rule using the standard deletion mechanism
    this.deleteRule(registry, ruleInfo);

    // Remove from global rules tracking
    registry.globalRules.delete(globalKey);
  }

  /**
   * Adjust rule indices after deletion to account for shifting
   */
  private adjustIndicesAfterDeletion(
    registry: RootRegistry,
    sheetIndex: number,
    startIdx: number,
    endIdx: number,
    deleteCount: number,
    deletedRuleInfo: RuleInfo,
    deletedIndices?: number[],
  ): void {
    try {
      const sortedDeleted =
        deletedIndices && deletedIndices.length > 0
          ? [...deletedIndices].sort((a, b) => a - b)
          : null;
      const countDeletedBefore = (sorted: number[], idx: number): number => {
        let shift = 0;
        for (const delIdx of sorted) {
          if (delIdx < idx) shift++;
          else break;
        }
        return shift;
      };
      // Helper function to adjust a single RuleInfo
      const adjustRuleInfo = (info: RuleInfo): void => {
        if (info === deletedRuleInfo) return; // Skip the deleted rule
        if (info.sheetIndex !== sheetIndex) return; // Different sheet

        if (!info.indices || info.indices.length === 0) {
          return;
        }

        if (sortedDeleted) {
          // Adjust each index based on how many deleted indices are before it
          info.indices = info.indices.map((idx) => {
            return idx - countDeletedBefore(sortedDeleted, idx);
          });
        } else {
          // Contiguous deletion: shift indices after the deleted range
          info.indices = info.indices.map((idx) =>
            idx > endIdx ? Math.max(0, idx - deleteCount) : idx,
          );
        }

        // Update ruleIndex and endRuleIndex to match adjusted indices
        if (info.indices.length > 0) {
          info.ruleIndex = Math.min(...info.indices);
          info.endRuleIndex = Math.max(...info.indices);
        }
      };

      // Adjust active rules
      for (const info of registry.rules.values()) {
        adjustRuleInfo(info);
      }

      // Adjust global rules
      for (const info of registry.globalRules.values()) {
        adjustRuleInfo(info);
      }

      // No need to separately adjust unused rules since they're part of the rules Map

      // Adjust keyframes indices stored in cache
      for (const entry of registry.keyframesCache.values()) {
        const ki = entry.info as KeyframesInfo;
        if (ki.sheetIndex !== sheetIndex) continue;
        if (sortedDeleted) {
          const shift = countDeletedBefore(sortedDeleted, ki.ruleIndex);
          if (shift > 0) {
            ki.ruleIndex = Math.max(0, ki.ruleIndex - shift);
          }
        } else if (ki.ruleIndex > endIdx) {
          ki.ruleIndex = Math.max(0, ki.ruleIndex - deleteCount);
        }
      }
    } catch {
      // Defensive: do not let index adjustments crash cleanup
    }
  }

  /**
   * Delete a CSS rule from the sheet
   */
  deleteRule(registry: RootRegistry, ruleInfo: RuleInfo): void {
    const sheet = registry.sheets[ruleInfo.sheetIndex];

    if (!sheet) {
      return;
    }

    try {
      const texts: string[] =
        this.config.devMode && Array.isArray(ruleInfo.cssText)
          ? ruleInfo.cssText.slice()
          : [];

      const styleSheet = this.getCSSSheet(sheet);

      if (styleSheet) {
        const rules = styleSheet.cssRules;

        // Use exact indices if available, otherwise fall back to range
        if (ruleInfo.indices && ruleInfo.indices.length > 0) {
          // NEW: Delete using exact tracked indices
          const sortedIndices = [...ruleInfo.indices].sort((a, b) => b - a); // Sort descending
          const deletedIndices: number[] = [];

          for (const idx of sortedIndices) {
            if (idx >= 0 && idx < styleSheet.cssRules.length) {
              try {
                styleSheet.deleteRule(idx);
                deletedIndices.push(idx);
              } catch (e) {
                console.warn(`Failed to delete rule at index ${idx}:`, e);
              }
            }
          }

          sheet.ruleCount = Math.max(
            0,
            sheet.ruleCount - deletedIndices.length,
          );

          // Adjust indices for all other rules
          if (deletedIndices.length > 0) {
            this.adjustIndicesAfterDeletion(
              registry,
              ruleInfo.sheetIndex,
              Math.min(...deletedIndices),
              Math.max(...deletedIndices),
              deletedIndices.length,
              ruleInfo,
              deletedIndices,
            );
          }
        } else {
          // FALLBACK: Use old range-based deletion for backwards compatibility
          const startIdx = Math.max(0, ruleInfo.ruleIndex);
          const endIdx = Math.min(
            rules.length - 1,
            Number.isFinite(ruleInfo.endRuleIndex as number)
              ? (ruleInfo.endRuleIndex as number)
              : startIdx,
          );

          if (Number.isFinite(startIdx) && endIdx >= startIdx) {
            const deleteCount = endIdx - startIdx + 1;
            for (let idx = endIdx; idx >= startIdx; idx--) {
              if (idx < 0 || idx >= styleSheet.cssRules.length) continue;
              styleSheet.deleteRule(idx);
            }
            sheet.ruleCount = Math.max(0, sheet.ruleCount - deleteCount);

            // After deletion, all subsequent rule indices shift left by deleteCount.
            // We must adjust stored indices for all other RuleInfo within the same sheet.
            this.adjustIndicesAfterDeletion(
              registry,
              ruleInfo.sheetIndex,
              startIdx,
              endIdx,
              deleteCount,
              ruleInfo,
            );
          }
        }
      }

      // Dev-only: remove cssText entries from validation set
      if (this.config.devMode && texts.length) {
        try {
          for (const text of texts) {
            registry.ruleTextSet.delete(text);
          }
        } catch {
          // noop
        }
      }
    } catch (error) {
      console.warn('Failed to delete CSS rule:', error);
    }
  }

  /**
   * Find a sheet with available space or return null
   */
  private findAvailableSheet(
    registry: RootRegistry,
    _root: Document | ShadowRoot,
  ): SheetInfo | null {
    const maxRules = this.config.maxRulesPerSheet;

    if (!maxRules) {
      // No limit, use the last sheet if it exists
      const lastSheet = registry.sheets[registry.sheets.length - 1];
      return lastSheet || null;
    }

    // Find sheet with space
    for (const sheet of registry.sheets) {
      if (sheet.ruleCount < maxRules) {
        return sheet;
      }
    }

    return null; // No available sheet found
  }

  /**
   * Find an available rule index in the sheet
   */
  findAvailableRuleIndex(sheet: SheetInfo): number {
    // Always append to the end - CSS doesn't have holes
    return sheet.ruleCount;
  }

  /**
   * Force cleanup of unused styles
   */
  public forceCleanup(registry: RootRegistry): void {
    this.performBulkCleanup(registry);
  }

  /**
   * Perform bulk cleanup of all unused styles (refCount = 0).
   */
  private performBulkCleanup(registry: RootRegistry): void {
    const cleanupStartTime = Date.now();

    // Calculate unused rules dynamically: rules that have refCount = 0
    // and are not tracked in usageMap (GC-kept styles must survive)
    const unusedClassNames = Array.from(registry.refCounts.entries())
      .filter(
        ([className, refCount]) =>
          refCount === 0 && !registry.usageMap.has(className),
      )
      .map(([className]) => className);

    if (unusedClassNames.length === 0) return;

    const selected = unusedClassNames
      .map((className) => {
        const ruleInfo = registry.rules.get(className);
        return ruleInfo ? { className, ruleInfo } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    let cleanedUpCount = 0;
    let totalCssSize = 0;
    let totalRulesDeleted = 0;

    // Group by sheet for efficient deletion
    const rulesBySheet = new Map<
      number,
      { className: string; ruleInfo: RuleInfo }[]
    >();

    // Calculate CSS size before deletion and group rules
    for (const { className, ruleInfo } of selected) {
      const sheetIndex = ruleInfo.sheetIndex;

      // Dev-only metrics: estimate CSS size and rule count if available
      if (this.config.devMode && Array.isArray(ruleInfo.cssText)) {
        const cssSize = ruleInfo.cssText.reduce(
          (total, css) => total + css.length,
          0,
        );
        totalCssSize += cssSize;
        totalRulesDeleted += ruleInfo.cssText.length;
      }

      if (!rulesBySheet.has(sheetIndex)) {
        rulesBySheet.set(sheetIndex, []);
      }
      rulesBySheet.get(sheetIndex)!.push({ className, ruleInfo });
    }

    // Delete rules from each sheet (in reverse order to preserve indices)
    for (const [_sheetIndex, rulesInSheet] of rulesBySheet) {
      // Sort by rule index in descending order for safe deletion
      rulesInSheet.sort((a, b) => b.ruleInfo.ruleIndex - a.ruleInfo.ruleIndex);

      for (const { className, ruleInfo } of rulesInSheet) {
        // SAFETY 1: Double-check refCount is still 0
        const currentRefCount = registry.refCounts.get(className) || 0;
        if (currentRefCount > 0) {
          // Class became active again; do not delete
          continue;
        }

        // SAFETY 2: Ensure rule wasn't replaced
        // Between scheduling and execution a class may have been replaced with a new RuleInfo
        const currentInfo = registry.rules.get(className);
        if (currentInfo !== ruleInfo) {
          // Rule was replaced; skip deletion of the old reference
          continue;
        }

        // SAFETY 3: Verify the sheet entry is still valid and accessible
        const sheetInfo = registry.sheets[ruleInfo.sheetIndex];
        if (!sheetInfo || (!sheetInfo.sheet && !sheetInfo.constructableSheet)) {
          // Sheet was removed or corrupted; skip this rule
          continue;
        }

        // SAFETY 4: Verify the stylesheet itself is accessible
        const styleSheet = this.getCSSSheet(sheetInfo);
        if (!styleSheet) {
          // Stylesheet not available; skip this rule
          continue;
        }

        // SAFETY 5: Verify rule index is still within valid range
        const maxRuleIndex = styleSheet.cssRules.length - 1;
        const startIdx = ruleInfo.ruleIndex;
        const endIdx = ruleInfo.endRuleIndex ?? ruleInfo.ruleIndex;

        if (startIdx < 0 || endIdx > maxRuleIndex || startIdx > endIdx) {
          // Rule indices are out of bounds; skip this rule
          continue;
        }

        // All safety checks passed - proceed with deletion
        this.deleteRule(registry, ruleInfo);
        registry.rules.delete(className);
        registry.refCounts.delete(className);

        // Clean up cache key mappings that point to this className
        const keysToDelete: string[] = [];
        for (const [
          key,
          mappedClassName,
        ] of registry.cacheKeyToClassName.entries()) {
          if (mappedClassName === className) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          registry.cacheKeyToClassName.delete(key);
        }
        cleanedUpCount++;
      }
    }

    // Update metrics
    if (registry.metrics) {
      registry.metrics.bulkCleanups++;
      registry.metrics.stylesCleanedUp += cleanedUpCount;

      // Add detailed cleanup stats to history
      registry.metrics.cleanupHistory.push({
        timestamp: cleanupStartTime,
        classesDeleted: cleanedUpCount,
        cssSize: totalCssSize,
        rulesDeleted: totalRulesDeleted,
      });
    }
  }

  /**
   * Get total number of rules across all sheets
   */
  getTotalRuleCount(registry: RootRegistry): number {
    return registry.sheets.reduce(
      (total, sheet) => total + sheet.ruleCount - sheet.holes.length,
      0,
    );
  }

  /**
   * Get CSS text from all sheets (for SSR)
   */
  getCssText(registry: RootRegistry): string {
    const cssChunks: string[] = [];

    for (const sheetInfo of registry.sheets) {
      try {
        if (sheetInfo.constructableSheet) {
          const rules = Array.from(sheetInfo.constructableSheet.cssRules);
          cssChunks.push(rules.map((rule) => rule.cssText).join('\n'));
        } else if (sheetInfo.sheet) {
          const styleElement = sheetInfo.sheet;
          if (styleElement.textContent) {
            cssChunks.push(styleElement.textContent);
          } else if (styleElement.sheet) {
            const rules = Array.from(styleElement.sheet.cssRules);
            cssChunks.push(rules.map((rule) => rule.cssText).join('\n'));
          }
        }
      } catch (error) {
        console.warn('Failed to read CSS from sheet:', error);
      }
    }

    return cssChunks.join('\n');
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(registry: RootRegistry): CacheMetrics | null {
    if (!registry.metrics) return null;

    // Calculate unusedHits on demand - only count CSS rules since keyframes are disposed immediately
    const unusedRulesCount = Array.from(registry.refCounts.values()).filter(
      (count) => count === 0,
    ).length;

    return {
      ...registry.metrics,
      unusedHits: unusedRulesCount,
    };
  }

  /**
   * Reset cache performance metrics
   */
  resetMetrics(registry: RootRegistry): void {
    if (registry.metrics) {
      registry.metrics = {
        hits: 0,
        misses: 0,
        bulkCleanups: 0,
        totalInsertions: 0,
        totalUnused: 0,
        stylesCleanedUp: 0,
        cleanupHistory: [],
        startTime: Date.now(),
      };
    }
  }

  /**
   * Convert keyframes steps to CSS string.
   * Public so the SSR collector can format keyframes without DOM access.
   * Returns both the CSS text and a combined declarations string for property type scanning.
   */
  stepsToCSS(steps: KeyframesSteps): {
    css: string;
    declarations: string;
  } {
    const rules: string[] = [];
    const allDeclarations: string[] = [];

    for (const [key, value] of Object.entries(steps)) {
      // Support raw CSS strings for backwards compatibility
      if (typeof value === 'string') {
        rules.push(`${key} { ${value.trim()} }`);
        allDeclarations.push(value.trim());
        continue;
      }

      // Treat value as a style map and process via tasty style handlers
      const styleMap = (value || {}) as StyleValueStateMap;

      // Build a deterministic handler queue based on present style keys
      const styleNames = Object.keys(styleMap).sort();
      const handlerQueue: StyleHandler[] = [];
      const seenHandlers = new Set<StyleHandler>();

      styleNames.forEach((styleName) => {
        let handlers = STYLE_HANDLER_MAP[styleName];
        if (!handlers) {
          // Create a default handler for unknown styles (maps to kebab-case CSS or custom props)
          handlers = STYLE_HANDLER_MAP[styleName] = [createStyle(styleName)];
        }

        handlers.forEach((handler) => {
          if (!seenHandlers.has(handler)) {
            seenHandlers.add(handler);
            handlerQueue.push(handler);
          }
        });
      });

      // Accumulate declarations (ordered). We intentionally ignore `$` selector fan-out
      // and any responsive/state bindings for keyframes.
      const declarationPairs: { prop: string; value: string }[] = [];

      handlerQueue.forEach((handler) => {
        const lookup = handler.__lookupStyles;
        const filteredMap = lookup.reduce<StyleValueStateMap>((acc, name) => {
          const v = styleMap[name];
          if (v !== undefined) acc[name] = v;
          return acc;
        }, {});

        const result = handler(filteredMap);
        if (!result) return;

        const results = Array.isArray(result) ? result : [result];
        results.forEach((cssMap) => {
          if (!cssMap || typeof cssMap !== 'object') return;
          const { $: _$, ...props } = cssMap as CSSMap;

          Object.entries(props).forEach(([prop, val]) => {
            if (val == null || val === '') return;

            if (Array.isArray(val)) {
              // Multiple values for the same property -> emit in order
              val.forEach((v) => {
                if (v != null && v !== '') {
                  declarationPairs.push({ prop, value: String(v) });
                }
              });
            } else {
              declarationPairs.push({ prop, value: String(val) });
            }
          });
        });
      });

      // Fallback: if nothing produced (e.g., empty object), generate empty block
      const declarations = declarationPairs
        .map((d) => `${d.prop}: ${d.value}`)
        .join('; ');

      rules.push(`${key} { ${declarations.trim()} }`);
      allDeclarations.push(declarations);
    }

    return { css: rules.join(' '), declarations: allDeclarations.join('; ') };
  }

  /**
   * Insert keyframes rule.
   * Returns the KeyframesInfo and the raw declarations string for property type scanning.
   */
  insertKeyframes(
    registry: RootRegistry,
    steps: KeyframesSteps,
    name: string,
    root: Document | ShadowRoot,
  ): { info: KeyframesInfo; declarations: string } | null {
    let targetSheet = this.findAvailableSheet(registry, root);
    if (!targetSheet) {
      targetSheet = this.createSheet(registry, root);
    }

    const ruleIndex = this.findAvailableRuleIndex(targetSheet);
    const sheetIndex = registry.sheets.indexOf(targetSheet);

    try {
      const { css: cssSteps, declarations } = this.stepsToCSS(steps);
      const fullRule = `@keyframes ${name} { ${cssSteps} }`;

      const styleSheet = this.getCSSSheet(targetSheet);

      if (styleSheet && !this.config.forceTextInjection) {
        const safeIndex = Math.min(
          Math.max(0, ruleIndex),
          styleSheet.cssRules.length,
        );
        styleSheet.insertRule(fullRule, safeIndex);
      } else if (targetSheet.sheet) {
        targetSheet.sheet.textContent =
          (targetSheet.sheet.textContent || '') + '\n' + fullRule;
      }

      targetSheet.ruleCount++;

      return {
        info: {
          name,
          ruleIndex,
          sheetIndex,
          cssText: this.config.devMode ? fullRule : undefined,
        },
        declarations,
      };
    } catch (error) {
      console.warn('Failed to insert keyframes:', error);
      return null;
    }
  }

  /**
   * Delete keyframes rule
   */
  deleteKeyframes(registry: RootRegistry, info: KeyframesInfo): void {
    const sheet = registry.sheets[info.sheetIndex];
    if (!sheet) return;

    try {
      const styleSheet = this.getCSSSheet(sheet);

      if (styleSheet) {
        if (
          info.ruleIndex >= 0 &&
          info.ruleIndex < styleSheet.cssRules.length
        ) {
          styleSheet.deleteRule(info.ruleIndex);
          sheet.ruleCount = Math.max(0, sheet.ruleCount - 1);

          // Adjust indices for all other rules in the same sheet
          // This is critical - when a keyframe rule is deleted, all rules
          // with higher indices shift down by 1
          this.adjustIndicesAfterDeletion(
            registry,
            info.sheetIndex,
            info.ruleIndex,
            info.ruleIndex,
            1,
            // Create a dummy RuleInfo to satisfy the function signature
            {
              className: '',
              ruleIndex: info.ruleIndex,
              sheetIndex: info.sheetIndex,
            } as RuleInfo,
            [info.ruleIndex],
          );
        }
      }
    } catch (error) {
      console.warn('Failed to delete keyframes:', error);
    }
  }

  /**
   * Clean up resources for a root
   */
  cleanup(root: Document | ShadowRoot): void {
    const registry = this.rootRegistries.get(root);

    if (!registry) {
      return;
    }

    if (registry.injectionMode === 'adopted') {
      // Remove all adopted stylesheets from the shadow root
      const shadowRoot = root as ShadowRoot;

      // Collect all constructable sheets owned by this registry
      const ownedSheets = new Set<CSSStyleSheet>();
      for (const sheetInfo of registry.sheets) {
        if (sheetInfo.constructableSheet) {
          ownedSheets.add(sheetInfo.constructableSheet);
        }
      }

      // Also include the raw CSS constructable sheet
      const rawSheet = this.rawConstructableSheets.get(shadowRoot);
      if (rawSheet) {
        ownedSheets.add(rawSheet);
        this.rawConstructableSheets.delete(shadowRoot);
      }

      // Remove owned sheets from adoptedStyleSheets
      if (ownedSheets.size > 0) {
        shadowRoot.adoptedStyleSheets = shadowRoot.adoptedStyleSheets.filter(
          (s) => !ownedSheets.has(s),
        );
      }
    } else {
      // Remove all <style> elements
      for (const sheet of registry.sheets) {
        try {
          const styleElement = sheet.sheet;
          if (styleElement?.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
          }
        } catch (error) {
          console.warn('Failed to cleanup sheet:', error);
        }
      }

      // Clean up raw CSS style element
      const rawStyleElement = this.rawStyleElements.get(root);
      if (rawStyleElement?.parentNode) {
        rawStyleElement.parentNode.removeChild(rawStyleElement);
      }
      this.rawStyleElements.delete(root);
    }

    // Clear registry
    this.rootRegistries.delete(root);
    this.activeRoots.delete(root);
    this.rawCSSBlocks.delete(root);
  }

  /**
   * Check if a root uses adopted injection mode.
   */
  private isAdoptedMode(root: Document | ShadowRoot): boolean {
    const registry = this.rootRegistries.get(root);
    if (registry) return registry.injectionMode === 'adopted';
    return this.detectInjectionMode(root) === 'adopted';
  }

  /**
   * Get or create a constructable CSSStyleSheet for raw CSS in adopted mode.
   * The raw sheet is prepended to adoptedStyleSheets so it precedes tasty rules.
   */
  private getOrCreateRawAdoptedSheet(root: ShadowRoot): CSSStyleSheet {
    let sheet = this.rawConstructableSheets.get(root);

    if (!sheet) {
      sheet = new CSSStyleSheet();
      // Prepend raw sheet before any tasty-managed sheets for cascade ordering
      root.adoptedStyleSheets = [sheet, ...root.adoptedStyleSheets];
      this.rawConstructableSheets.set(root, sheet);
      if (!this.rawCSSBlocks.has(root)) {
        this.rawCSSBlocks.set(root, new Map());
      }
    }

    return sheet;
  }

  /**
   * Get or create a dedicated style element for raw CSS
   * Raw CSS is kept separate from tasty-managed sheets to avoid index conflicts
   */
  private getOrCreateRawStyleElement(
    root: Document | ShadowRoot,
  ): HTMLStyleElement {
    let styleElement = this.rawStyleElements.get(root);

    if (!styleElement) {
      styleElement =
        (root as Document).createElement?.('style') ||
        document.createElement('style');

      if (this.config.nonce) {
        styleElement.nonce = this.config.nonce;
      }

      styleElement.setAttribute('data-tasty-raw', '');

      // Append to head or shadow root
      if ('head' in root && root.head) {
        root.head.appendChild(styleElement);
      } else if ('appendChild' in root) {
        root.appendChild(styleElement);
      } else {
        document.head.appendChild(styleElement);
      }

      this.rawStyleElements.set(root, styleElement);
      this.rawCSSBlocks.set(root, new Map());
    }

    return styleElement;
  }

  /**
   * Inject raw CSS text directly without parsing
   * Returns a dispose function to remove the injected CSS
   */
  injectRawCSS(css: string, root: Document | ShadowRoot): RawCSSResult {
    if (!css.trim()) {
      return {
        dispose: () => {
          /* noop */
        },
      };
    }

    // Generate unique ID for this block
    const id = `raw_${this.rawCSSCounter++}`;

    if (this.isAdoptedMode(root)) {
      this.getOrCreateRawAdoptedSheet(root as ShadowRoot);
      const blocksMap = this.rawCSSBlocks.get(root)!;

      const info: RawCSSInfo = {
        id,
        css,
        startOffset: 0,
        endOffset: css.length,
      };
      blocksMap.set(id, info);

      // Rebuild full text and apply via replaceSync
      this.rebuildRawAdoptedSheet(root as ShadowRoot);

      return {
        dispose: () => {
          this.disposeRawCSS(id, root);
        },
      };
    }

    const styleElement = this.getOrCreateRawStyleElement(root);
    const blocksMap = this.rawCSSBlocks.get(root)!;

    // Calculate offsets
    const currentContent = styleElement.textContent || '';
    const startOffset = currentContent.length;
    const cssWithNewline = (currentContent ? '\n' : '') + css;
    const endOffset = startOffset + cssWithNewline.length;

    // Append CSS
    styleElement.textContent = currentContent + cssWithNewline;

    // Track the block
    const info: RawCSSInfo = {
      id,
      css,
      startOffset,
      endOffset,
    };
    blocksMap.set(id, info);

    return {
      dispose: () => {
        this.disposeRawCSS(id, root);
      },
    };
  }

  /**
   * Rebuild the raw CSS constructable sheet from all tracked blocks.
   */
  private rebuildRawAdoptedSheet(root: ShadowRoot): void {
    const sheet = this.rawConstructableSheets.get(root);
    const blocksMap = this.rawCSSBlocks.get(root);
    if (!sheet || !blocksMap) return;

    if (blocksMap.size === 0) {
      sheet.replaceSync('');
      return;
    }

    const blocks = Array.from(blocksMap.values());
    blocks.sort((a, b) => a.startOffset - b.startOffset);
    const allCSS = blocks.map((b) => b.css).join('\n');
    sheet.replaceSync(allCSS);
  }

  /**
   * Remove a raw CSS block by ID
   */
  private disposeRawCSS(id: string, root: Document | ShadowRoot): void {
    const blocksMap = this.rawCSSBlocks.get(root);
    if (!blocksMap) return;

    const info = blocksMap.get(id);
    if (!info) return;

    blocksMap.delete(id);

    // Adopted mode: rebuild via replaceSync
    if (this.isAdoptedMode(root)) {
      this.rebuildRawAdoptedSheet(root as ShadowRoot);
      return;
    }

    // Style-element mode: rebuild textContent
    const styleElement = this.rawStyleElements.get(root);
    if (!styleElement) return;

    const remainingBlocks = Array.from(blocksMap.values());

    if (remainingBlocks.length === 0) {
      styleElement.textContent = '';
    } else {
      remainingBlocks.sort((a, b) => a.startOffset - b.startOffset);
      const newContent = remainingBlocks.map((block) => block.css).join('\n');
      styleElement.textContent = newContent;

      // Update offsets for remaining blocks
      let offset = 0;
      for (const block of remainingBlocks) {
        block.startOffset = offset;
        block.endOffset = offset + block.css.length;
        offset = block.endOffset + 1; // +1 for newline
      }
    }
  }

  /**
   * Get the raw CSS content
   */
  getRawCSSText(root: Document | ShadowRoot): string {
    // In adopted mode, read from the blocks map (source of truth)
    if (this.isAdoptedMode(root)) {
      const blocksMap = this.rawCSSBlocks.get(root);
      if (!blocksMap || blocksMap.size === 0) return '';
      const blocks = Array.from(blocksMap.values());
      blocks.sort((a, b) => a.startOffset - b.startOffset);
      return blocks.map((b) => b.css).join('\n');
    }

    const styleElement = this.rawStyleElements.get(root);
    return styleElement?.textContent || '';
  }
}
