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
   * Record an inserted rule text at its rule index (text mode only).
   *
   * `textRules` mirrors the sheet's rule order. `textContent` cannot be edited
   * rule-by-rule the way CSSOM can, so keeping the texts is what makes
   * deletion possible at all in this mode.
   */
  private trackTextRule(
    sheet: SheetInfo,
    ruleIndex: number,
    ruleText: string,
  ): void {
    if (!sheet.textMode) return;

    const rules = (sheet.textRules ??= []);
    // Defensive: keep the array dense so indices stay meaningful
    while (rules.length < ruleIndex) rules.push('');
    rules[ruleIndex] = ruleText;
  }

  /**
   * Remove rule indices from a text-mode sheet and rewrite the element's text.
   * Returns the indices that were actually removed.
   */
  private deleteTextRules(sheet: SheetInfo, indices: number[]): number[] {
    const rules = sheet.textRules;
    if (!rules) return [];

    const removed = [...new Set(indices)]
      .filter((idx) => idx >= 0 && idx < rules.length)
      .sort((a, b) => b - a);

    for (const idx of removed) {
      rules.splice(idx, 1);
    }

    if (removed.length > 0 && sheet.sheet) {
      sheet.sheet.textContent = rules.length ? '\n' + rules.join('\n') : '';
    }

    return removed;
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
        pinCounts: new Map(),
        rules: new Map(),
        cacheKeyToClassName: new Map(),
        ruleTextSet: new Set<string>(),
        metrics,
        keyframesCache: new Map(),
        keyframesNameToContent: new Map(),
        keyframesCounter: 0,
        injectedProperties: new Map<string, string>(),
        injectedFontFaces: new Set<string>(),
        injectedCounterStyles: new Map<string, boolean>(),
        injectedFunctions: new Map<string, boolean>(),
        globalRules: new Map(),
        propertyTypeResolver: new PropertyTypeResolver(),
        committed: new Map(),
        candidates: new Map(),
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

    // Pin the write mode now: `insertRule` and `deleteRule` must agree on it for
    // the lifetime of the sheet, otherwise tracked rule indices desync from
    // whichever representation is actually applied.
    const textMode =
      this.config.forceTextInjection === true || sheet.sheet == null;

    const sheetInfo: SheetInfo = {
      sheet,
      ruleCount: 0,
      holes: [],
      textMode,
      ...(textMode ? { textRules: [] } : {}),
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
      console.error(
        '[Tasty] SheetManager: style element failed to connect to the DOM.',
        {
          parentNode: style.parentNode?.nodeName,
          isConnected: style.isConnected,
        },
      );
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

        if (!targetSheet.textMode && styleSheet) {
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
          } catch (e) {
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
                } catch (singleErr) {
                  // Skip unsupported selector in this engine (e.g., ::-moz-selection in Blink)
                  if (process.env.NODE_ENV !== 'production') {
                    console.warn(
                      '[Tasty] Browser rejected CSS rule:',
                      singleRule,
                      singleErr,
                    );
                  }
                }
              }
              // If none inserted, continue without throwing to avoid aborting the whole batch
              if (!anyInserted) {
                // noop: all selectors invalid here; safe to skip
              }
            } else {
              // Single selector failed — skip it silently (likely unsupported in this engine).
              // For @property rules specifically, probe once per registry to distinguish
              // "engine doesn't support @property at all" (e.g., jsdom) from
              // "engine supports @property but this specific rule is invalid"
              // (a real user bug worth warning about).
              if (process.env.NODE_ENV !== 'production') {
                const isAtProperty = fullRule.startsWith('@property ');
                const shouldSuppress =
                  isAtProperty &&
                  !this.engineSupportsAtProperty(registry, styleSheet);
                if (!shouldSuppress) {
                  console.warn(
                    '[Tasty] Browser rejected CSS rule:',
                    fullRule,
                    e,
                  );
                }
              }
            }
          }
        } else if (styleElement) {
          // Use textContent (either as fallback or when forceTextInjection is enabled)
          // Calculate index atomically for textContent insertion too
          const atomicRuleIndex = this.findAvailableRuleIndex(targetSheet);
          // Record the text so `deleteRule` can rebuild the element without it
          this.trackTextRule(targetSheet, atomicRuleIndex, fullRule);
          styleElement.textContent =
            (styleElement.textContent || '') + '\n' + fullRule;
          // Update sheet ruleCount immediately
          targetSheet.ruleCount++;
          insertedIndices.push(atomicRuleIndex); // Track this index
          if (firstInsertedIndex == null) firstInsertedIndex = atomicRuleIndex;
          lastInsertedIndex = atomicRuleIndex;
          currentRuleIndex = atomicRuleIndex + 1;
        }

        // Report a detached style element only if there are issues and we're not using forceTextInjection
        if (
          styleElement &&
          !styleElement.parentNode &&
          !this.config.forceTextInjection
        ) {
          console.error(
            '[Tasty] SheetManager: style element is not attached to the DOM; rules will not apply.',
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
      console.warn('[Tasty] Failed to insert CSS rules:', error, {
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

      if (sheet.textMode) {
        // Text mode: splice the rules out of the tracked texts and rewrite the
        // element. Never also touch CSSOM here — assigning textContent
        // reparses the sheet, so a CSSOM delete would be undone anyway.
        let targetIndices: number[];

        if (ruleInfo.indices && ruleInfo.indices.length > 0) {
          targetIndices = ruleInfo.indices;
        } else {
          // FALLBACK: range-based deletion, mirroring the CSSOM path below
          const startIdx = Math.max(0, ruleInfo.ruleIndex);
          const endIdx = Math.min(
            (sheet.textRules?.length ?? 0) - 1,
            Number.isFinite(ruleInfo.endRuleIndex as number)
              ? (ruleInfo.endRuleIndex as number)
              : startIdx,
          );

          targetIndices = [];
          for (let idx = startIdx; idx <= endIdx; idx++) {
            targetIndices.push(idx);
          }
        }

        const deletedIndices = this.deleteTextRules(sheet, targetIndices);

        if (deletedIndices.length > 0) {
          sheet.ruleCount = Math.max(
            0,
            sheet.ruleCount - deletedIndices.length,
          );

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
      } else if (styleSheet) {
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
                console.warn(
                  `[Tasty] Failed to delete rule at index ${idx}:`,
                  e,
                );
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
      console.warn('[Tasty] Failed to delete CSS rule:', error);
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
   * Probe whether the underlying CSS engine supports `@property` at-rules.
   * Result is cached per registry on `registry.atPropertySupported`.
   *
   * The probe inserts and immediately deletes a minimal known-valid rule
   * (`@property --__tasty_probe__ { syntax: "*"; inherits: true; }`).
   * Engines that lack `@property` support (jsdom, happy-dom) reject any
   * `@property` rule including this one, so a probe failure is a reliable
   * signal that further `@property` rejections are environmental noise and
   * not user-authored bugs.
   *
   * The probe is intentionally a separate operation from the user's failing
   * insertion: we don't want to leak `--__tasty_probe__` into the sheet, so
   * on success we delete the probe rule immediately, leaving `ruleCount`
   * and `cssRules.length` unchanged.
   */
  private engineSupportsAtProperty(
    registry: RootRegistry,
    styleSheet: CSSStyleSheet,
  ): boolean {
    if (registry.atPropertySupported !== undefined) {
      return registry.atPropertySupported;
    }

    const probeRule =
      '@property --__tasty_probe__ { syntax: "*"; inherits: true; }';

    try {
      const probeIdx = styleSheet.cssRules.length;
      styleSheet.insertRule(probeRule, probeIdx);
      try {
        styleSheet.deleteRule(probeIdx);
      } catch {
        // noop: unable to delete the probe; leaving it in is harmless
        // (declares an unused CSS custom property scoped to documentElement)
      }
      registry.atPropertySupported = true;
    } catch {
      registry.atPropertySupported = false;
    }

    return registry.atPropertySupported;
  }

  /**
   * Delete the given classes: their rules leave the sheets and every registry
   * entry pointing at them is dropped.
   *
   * Deciding *what* is unused belongs to `StyleInjector.gc()`, which owns the
   * DOM scan and the capacity policy. This only re-checks that each class is
   * still safe to delete, and reports how many were.
   *
   * @returns Number of classes actually deleted.
   */
  public deleteClasses(
    registry: RootRegistry,
    classNames: Iterable<string>,
  ): number {
    const cleanupStartTime = Date.now();

    const selected = Array.from(classNames)
      .map((className) => {
        const ruleInfo = registry.rules.get(className);
        return ruleInfo ? { className, ruleInfo } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);

    if (selected.length === 0) return 0;

    const deleted = new Set<string>();
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
        // SAFETY 1: Never delete a class someone pinned
        if ((registry.pinCounts.get(className) ?? 0) > 0) {
          // Class was pinned again between collection and deletion
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

        // SAFETY 4: Verify the rule storage itself is accessible.
        // Text-mode sheets are backed by `textRules`, not CSSOM, so a missing
        // CSSStyleSheet is expected there and must not block cleanup.
        const styleSheet = this.getCSSSheet(sheetInfo);
        if (!sheetInfo.textMode && !styleSheet) {
          // Stylesheet not available; skip this rule
          continue;
        }

        // SAFETY 5: Verify rule index is still within valid range
        const maxRuleIndex =
          (sheetInfo.textMode
            ? (sheetInfo.textRules?.length ?? 0)
            : (styleSheet?.cssRules.length ?? 0)) - 1;
        const startIdx = ruleInfo.ruleIndex;
        const endIdx = ruleInfo.endRuleIndex ?? ruleInfo.ruleIndex;

        if (startIdx < 0 || endIdx > maxRuleIndex || startIdx > endIdx) {
          // Rule indices are out of bounds; skip this rule
          continue;
        }

        // All safety checks passed - proceed with deletion
        this.deleteRule(registry, ruleInfo);
        registry.rules.delete(className);
        registry.pinCounts.delete(className);
        registry.candidates.delete(className);
        deleted.add(className);
        cleanedUpCount++;
      }
    }

    // Cache keys are indexed by key, not by className, so finding the ones that
    // point at a deleted class means scanning the map — once for the whole
    // batch rather than once per class.
    if (deleted.size > 0) {
      for (const [key, mappedClassName] of registry.cacheKeyToClassName) {
        if (deleted.has(mappedClassName)) {
          registry.cacheKeyToClassName.delete(key);
        }
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

    return cleanedUpCount;
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
  getCSSText(registry: RootRegistry): string {
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
        console.warn('[Tasty] Failed to read CSS from sheet:', error);
      }
    }

    return cssChunks.join('\n');
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(registry: RootRegistry): CacheMetrics | null {
    if (!registry.metrics) return null;

    // `unusedHits` needs a DOM scan to be meaningful, so `StyleInjector.getMetrics()`
    // fills it in; a registry on its own cannot tell which classes are still rendered.
    return {
      ...registry.metrics,
      unusedHits: 0,
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

      if (!targetSheet.textMode && styleSheet) {
        const safeIndex = Math.min(
          Math.max(0, ruleIndex),
          styleSheet.cssRules.length,
        );
        styleSheet.insertRule(fullRule, safeIndex);
      } else if (targetSheet.sheet) {
        // Keyframes share the sheet's rule-index sequence, so their text has to
        // be tracked too or every later index desyncs
        this.trackTextRule(targetSheet, ruleIndex, fullRule);
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
      console.warn('[Tasty] Failed to insert keyframes:', error);
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

      // Adjust indices for all other rules in the same sheet.
      // This is critical - when a keyframe rule is deleted, all rules
      // with higher indices shift down by 1
      const adjustIndices = () =>
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

      if (sheet.textMode) {
        const deleted = this.deleteTextRules(sheet, [info.ruleIndex]);

        if (deleted.length > 0) {
          sheet.ruleCount = Math.max(0, sheet.ruleCount - 1);
          adjustIndices();
        }
      } else if (styleSheet) {
        if (
          info.ruleIndex >= 0 &&
          info.ruleIndex < styleSheet.cssRules.length
        ) {
          styleSheet.deleteRule(info.ruleIndex);
          sheet.ruleCount = Math.max(0, sheet.ruleCount - 1);
          adjustIndices();
        }
      }
    } catch (error) {
      console.warn('[Tasty] Failed to delete keyframes:', error);
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
          console.warn('[Tasty] Failed to cleanup sheet:', error);
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
