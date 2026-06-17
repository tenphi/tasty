/**
 * Tasty Style Rendering Pipeline
 *
 * Main entrypoint for the style rendering pipeline. Transforms a `Styles`
 * object into an array of `CSSRule` objects ready for DOM injection.
 *
 * Per-handler stages (see docs/pipeline.md for full detail):
 *   0.  PRE-PARSE NORMALIZATION    - extractCompoundStates (exclusive.ts)
 *   1.  PARSE CONDITIONS           - parseStyleEntries + parseStateKey
 *   1b. MERGE ENTRIES BY VALUE     - mergeEntriesByValue (exclusive.ts)
 *   2a. EXPAND USER OR BRANCHES    - expandOrConditions (exclusive.ts)
 *   2b. BUILD EXCLUSIVE CONDITIONS - buildExclusiveConditions
 *   3.  EXPAND DE MORGAN ORs       - expandExclusiveOrs (exclusive.ts)
 *   4.  COMPUTE STATE COMBINATIONS - computeStateCombinations
 *   5.  CALL HANDLERS              - run style handlers for each snapshot
 *   6.  MERGE BY VALUE             - mergeByValue (index.ts)
 *   7.  MATERIALIZE CSS            - conditionToCSS + materializeComputedRule
 *
 * Simplification (`simplifyCondition`) runs inside most stages; calls are
 * memoized by condition unique-id. The post-pass in `runPipeline` dedupes
 * identical rules and emits all `@starting-style` rules last so they win
 * the cascade over their equal-specificity normal counterparts.
 */

import { Lru } from '../parser/lru';
import type { StateParserContext } from '../states';
import {
  createStateParserContext,
  extractLocalPredefinedStates,
} from '../states';
import { createStyle, STYLE_HANDLER_MAP } from '../styles';
import type { Styles } from '../styles/types';
import type {
  StyleHandler,
  StyleMap,
  StyleValue,
  StyleValueStateMap,
} from '../utils/styles';
import { stringifyStyles } from '../utils/styles';

import type { ConditionNode } from './conditions';
import { and, or, trueCondition } from './conditions';
import type { ExclusiveStyleEntry } from './exclusive';
import {
  buildExclusiveConditions,
  expandExclusiveOrs,
  expandOrConditions,
  extractCompoundStates,
  isValueMapping,
  mergeEntriesByValue,
  parseStyleEntries,
} from './exclusive';
import type { CSSRule, SelectorVariant } from './materialize-types';
import {
  branchToCSS,
  buildAtRulesFromVariant,
  conditionToCSS,
  mergeVariantsIntoSelectorGroups,
  optimizeGroups,
  parentGroupsToCSS,
  rootGroupsToCSS,
  selectorGroupToCSS,
  wrapWhere,
} from './materialize';
import { parseStateKey } from './parseStateKey';
import { simplifyCondition } from './simplify';
import { emitWarning } from './warnings';

// ============================================================================
// Types (compatible with old renderStyles API)
// ============================================================================

/**
 * Matches the old StyleResult interface for backward compatibility
 */
export interface StyleResult {
  selector: string;
  declarations: string;
  atRules?: string[];
  needsClassName?: boolean;
  rootPrefix?: string;
  /** When true, declarations are wrapped in @starting-style { ... } inside the selector rule */
  startingStyle?: boolean;
}

/**
 * Matches the old RenderResult interface for backward compatibility
 */
export interface RenderResult {
  rules: StyleResult[];
  className?: string;
}

interface ComputedRule {
  condition: ConditionNode;
  declarations: Record<string, string>;
  selectorSuffix: string;
  /**
   * Cascade order hint (source priority of the highest-priority style entry
   * that contributed to this rule). Higher = should appear later in the
   * stylesheet so it wins the cascade. Used to emit `_` fallback floor rules
   * before the higher-priority rules that layer over them, since `:where()`
   * makes all rules share specificity and source order decides the winner.
   */
  order: number;
}

// ============================================================================
// Caching
// ============================================================================

const pipelineCache = new Lru<string, CSSRule[]>(5000);

/**
 * Check if a cache key exists in the pipeline cache.
 * Used by renderStylesForChunk to avoid building filtered styles on cache hit.
 */
export function hasPipelineCacheEntry(cacheKey: string): boolean {
  return pipelineCache.get(cacheKey) !== undefined;
}

/**
 * Clear the pipeline cache (for testing)
 */
export function clearPipelineCache(): void {
  pipelineCache.clear();
}

// ============================================================================
// Pipeline Implementation
// ============================================================================

function runPipeline(
  styles: Styles,
  parserContext: StateParserContext,
): CSSRule[] {
  const allRules: CSSRule[] = [];

  // Process styles recursively (including nested selectors)
  processStyles(styles, '', parserContext, allRules);

  // Deduplicate rules
  const seen = new Set<string>();
  const dedupedRules = allRules.filter((rule) => {
    const key = `${rule.selector}|${rule.declarations}|${rule.atRules?.join('|') ?? ''}|${rule.rootPrefix || ''}|${rule.startingStyle ? '1' : '0'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // @starting-style rules must come AFTER normal rules for the same selector.
  // They share the same specificity, so source order decides the cascade.
  // If a @starting-style rule appears before its normal counterpart,
  // the later normal rule overrides the starting value.
  const normal: CSSRule[] = [];
  const starting: CSSRule[] = [];

  for (const rule of dedupedRules) {
    if (rule.startingStyle) {
      starting.push(rule);
    } else {
      normal.push(rule);
    }
  }

  // Order rules by their cascade order hint (ascending source priority) so
  // higher-priority rules come later and win. This is load-bearing once
  // selector specificity is equalized via `:where()`: `_` fallback floor
  // rules (low order) must precede the higher-priority rules that layer over
  // them. The sort is stable, so equal-order rules keep their emission
  // order. Mutually-exclusive rules are unaffected by ordering.
  const stableOrdered = stableSortByOrder(normal);

  return stableOrdered.concat(stableSortByOrder(starting));
}

/**
 * Stable sort CSS rules by their `order` hint ascending. Rules without an
 * `order` are treated as 0. `Array.prototype.sort` is stable (ES2019+,
 * Node >= 20), so equal-order rules keep their emission order — the `_`
 * fallback floor (low order) stays before the overrides that layer over it.
 */
function stableSortByOrder(rules: CSSRule[]): CSSRule[] {
  if (rules.length <= 1) return rules;
  return [...rules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Process styles at a given nesting level.
 *
 * Splits keys into nested-selector keys and style-handler keys, recurses
 * into nested selectors, then runs the per-handler stages 1–7 over the
 * style keys.
 */
function processStyles(
  styles: Styles,
  selectorSuffix: string,
  parserContext: StateParserContext,
  allRules: CSSRule[],
): void {
  const keys = Object.keys(styles);

  // Separate selector keys from style keys.
  // Skip @keyframes (processed separately) and other @-prefixed keys
  // (predefined states), which are not handler entries.
  const selectorKeys = keys.filter((key) => isSelector(key));
  const styleKeys: string[] = [];
  for (const key of keys) {
    if (isSelector(key) || key.startsWith('@')) continue;

    // Reject top-level pseudo-class / pseudo-element keys like ':hover',
    // '::before', ':has(...)'. These are not valid Tasty style keys —
    // pseudo-states belong inside a value map (e.g. `color: { ':hover': '...' }`),
    // and nested-declaration form requires an `&` prefix (e.g. `'&:hover': {…}`).
    // Without `&`, a key like ':hover' falls through to a generic style
    // handler and produces malformed CSS, so we drop it and warn in dev.
    if (key.startsWith(':')) {
      emitWarning(
        'INVALID_TOP_LEVEL_PSEUDO_KEY',
        `Style key "${key}" starts with ':' which is not a valid Tasty style key. ` +
          `Use "&${key}" for nested-selector form, or move the state into a value map ` +
          `(e.g. \`{ color: { '${key}': value } }\`). The key has been ignored.`,
      );
      continue;
    }

    styleKeys.push(key);
  }

  // Process nested selectors first
  processNestedSelectors(
    styles,
    selectorKeys,
    selectorSuffix,
    parserContext,
    allRules,
  );

  // Process the handler queue for this level's style keys
  const handlerQueue = buildHandlerQueue(styleKeys, styles);
  processHandlerQueue(handlerQueue, selectorSuffix, parserContext, allRules);
}

/**
 * Recurse into nested selector keys. Each nested key may expand into multiple
 * suffixes (comma-separated patterns); each suffix is processed independently
 * with the parent's parser context augmented for sub-element scope.
 */
function processNestedSelectors(
  styles: Styles,
  selectorKeys: string[],
  selectorSuffix: string,
  parserContext: StateParserContext,
  allRules: CSSRule[],
): void {
  for (const key of selectorKeys) {
    const nestedStyles = styles[key] as Styles;
    if (!nestedStyles || typeof nestedStyles !== 'object') continue;

    // Get all selectors (handles comma-separated patterns)
    const suffixes = getAllSelectors(key, nestedStyles);
    if (!suffixes) continue; // Invalid selector, skip

    // Remove $ from nested styles
    const { $: _$, ...cleanedStyles } = nestedStyles;

    // Extract local predefined states scoped to this sub-element
    const subLocalStates = extractLocalPredefinedStates(cleanedStyles);
    const hasSubStates = Object.keys(subLocalStates).length > 0;
    const subContext: StateParserContext = {
      ...parserContext,
      isSubElement: true,
      localPredefinedStates: hasSubStates
        ? { ...parserContext.localPredefinedStates, ...subLocalStates }
        : parserContext.localPredefinedStates,
    };

    // Process for each selector (multiple selectors = same styles applied to each)
    for (const suffix of suffixes) {
      processStyles(
        cleanedStyles,
        selectorSuffix + suffix,
        subContext,
        allRules,
      );
    }
  }
}

/**
 * Run the per-handler pipeline (stages 1–7) over a handler queue and append
 * the resulting CSS rules to `allRules`.
 */
function processHandlerQueue(
  handlerQueue: ReturnType<typeof buildHandlerQueue>,
  selectorSuffix: string,
  parserContext: StateParserContext,
  allRules: CSSRule[],
): void {
  for (const { handler, styleMap } of handlerQueue) {
    const lookupStyles = handler.__lookupStyles;

    // Stages 0–3: build exclusive conditions for each style this handler
    // depends on (extractCompoundStates → parse → mergeEntriesByValue →
    // expandOrConditions → buildExclusiveConditions → expandExclusiveOrs).
    const exclusiveByStyle = buildExclusivesForHandler(
      lookupStyles,
      styleMap,
      parserContext,
    );

    // Stage 4: Compute all valid state combinations
    const stateSnapshots = computeStateCombinations(
      exclusiveByStyle,
      lookupStyles,
    );

    // Stage 5: Call handler for each snapshot
    const computedRules = invokeHandler(
      handler,
      stateSnapshots,
      selectorSuffix,
    );

    // Stage 6: Merge rules with identical CSS output
    const mergedRules = mergeByValue(computedRules);

    // Stage 7: Materialize to CSS
    for (const rule of mergedRules) {
      const cssRules = materializeComputedRule(rule);
      allRules.push(...cssRules);
    }
  }
}

/**
 * Stages 0–3 for a single handler: take the handler's looked-up style names,
 * resolve each style's value map into a list of mutually-exclusive entries.
 * Simple non-mapping values produce a single TRUE-conditioned entry.
 */
function buildExclusivesForHandler(
  lookupStyles: readonly string[],
  styleMap: StyleMap,
  parserContext: StateParserContext,
): Map<string, ExclusiveStyleEntry[]> {
  const exclusiveByStyle = new Map<string, ExclusiveStyleEntry[]>();

  for (const styleName of lookupStyles) {
    const value = styleMap[styleName];
    if (value === undefined) continue;

    if (isValueMapping(value)) {
      // Stage 0: Eliminate redundant compound state dimensions before parsing.
      // E.g. { '': A, '@dark': B, '@hc': A, '@dark & @hc': B }
      // reduces to { '': A, '@dark': B } because @hc is irrelevant.
      const reduced = extractCompoundStates(
        value as Record<string, StyleValue>,
      );

      // Stage 1: Parse entries from value mapping.
      const parsed = parseStyleEntries(styleName, reduced, (stateKey) =>
        parseStateKey(stateKey, { context: parserContext }),
      );

      // Stage 1b: Merge same-value entries before exclusive expansion to
      // prevent combinatorial blowup (e.g. @dark and @dark & @high-contrast
      // mapping to the same color). Merges happen only when provably safe
      // with respect to intermediate-priority entries, so the authored
      // cascade is preserved.
      const merged = mergeEntriesByValue(parsed);

      // Stage 2a: Expand user OR conditions into exclusive branches
      // (`A | B | C` becomes `A`, `B & !A`, `C & !A & !B`).
      const expanded = expandOrConditions(merged);

      // Stage 2b: Build exclusive conditions across all entries.
      const exclusive = buildExclusiveConditions(expanded);

      // Stage 3: Expand De Morgan ORs from negation into at-rule-aware
      // exclusive branches. `!A | !B` → `!A`, `A & !B`. Each branch keeps
      // the correct at-rule context.
      const fullyExpanded = expandExclusiveOrs(exclusive);
      exclusiveByStyle.set(styleName, fullyExpanded);
    } else {
      // Simple value — single entry with TRUE condition.
      exclusiveByStyle.set(styleName, [
        {
          styleKey: styleName,
          stateKey: '',
          value,
          condition: trueCondition(),
          priority: 0,
          exclusiveCondition: trueCondition(),
        },
      ]);
    }
  }

  return exclusiveByStyle;
}

/**
 * Stage 5: invoke the handler for each state snapshot and translate its
 * return value into ComputedRule entries (one per declaration set, fanned
 * out across any `$` selector suffixes the handler returns).
 */
function invokeHandler(
  handler: StyleHandler,
  stateSnapshots: ReturnType<typeof computeStateCombinations>,
  selectorSuffix: string,
): ComputedRule[] {
  const computedRules: ComputedRule[] = [];

  for (const snapshot of stateSnapshots) {
    const result = handler(snapshot.values as StyleValueStateMap);
    if (!result) continue;

    // Handler may return single or array
    const results = Array.isArray(result) ? result : [result];

    for (const r of results) {
      if (!r || typeof r !== 'object') continue;

      const { $, ...styleProps } = r;
      const declarations: Record<string, string> = {};

      for (const [prop, val] of Object.entries(styleProps)) {
        if (val != null && val !== '') {
          declarations[prop] = String(val);
        }
      }

      if (Object.keys(declarations).length === 0) continue;

      // Handle $ suffixes
      const suffixes = $
        ? (Array.isArray($) ? $ : [$]).map(
            (s) => selectorSuffix + normalizeSelectorSuffix(String(s)),
          )
        : [selectorSuffix];

      for (const suffix of suffixes) {
        computedRules.push({
          condition: snapshot.condition,
          declarations,
          selectorSuffix: suffix,
          order: snapshot.order,
        });
      }
    }
  }

  return computedRules;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a key is a CSS selector
 */
export function isSelector(key: string): boolean {
  return key.startsWith('&') || key.startsWith('.') || /^[A-Z]/.test(key);
}

/**
 * Result of processing a selector affix ($) pattern.
 *
 * @example
 * // Valid result with multiple selectors
 * { valid: true, selectors: ['> [data-element="Cell"]', ' [data-element="Body"] > [data-element="Cell"]'] }
 *
 * // Invalid result with error message
 * { valid: false, reason: 'Selector affix "+" targets elements outside the root scope.' }
 */
type AffixResult =
  | { valid: true; selectors: string[] }
  | { valid: false; reason: string };

/**
 * Get all selector suffixes for a sub-element key.
 *
 * Handles three types of selector keys:
 * - `&` prefix: Raw selector suffix (e.g., `&:hover` → `:hover`)
 * - `.` prefix: Class selector (e.g., `.active` → ` .active`)
 * - Uppercase: Sub-element with optional `$` affix pattern
 *
 * @param key - The sub-element key (e.g., 'Label', '&:hover', '.active')
 * @param styles - The styles object, may contain `$` property for selector affix
 * @returns Array of selector suffixes, or null if invalid (with console warning)
 *
 * @example
 * getAllSelectors('Label', {})
 * // → [' [data-element="Label"]']
 *
 * getAllSelectors('Cell', { $: '>, >Body>' })
 * // → ['> [data-element="Cell"]', ' [data-element="Body"] > [data-element="Cell"]']
 */
function getAllSelectors(key: string, styles?: Styles): string[] | null {
  if (key.startsWith('&')) {
    return [key.slice(1)];
  }

  if (key.startsWith('.')) {
    return [` ${key}`];
  }

  if (/^[A-Z]/.test(key)) {
    const affix = styles?.$;
    if (affix !== undefined) {
      const result = processAffix(String(affix), key);
      if (!result.valid) {
        emitWarning('INVALID_SELECTOR_AFFIX', result.reason);
        return null;
      }
      return result.selectors;
    }
    return [` [data-element="${key}"]`];
  }

  return null;
}

/**
 * Process selector affix pattern and return selector(s)
 *
 * Supports:
 * - Direct child: '>'
 * - Chained elements: '>Body>Row>'
 * - HTML tags (no key injection): 'h1', '>ul>li', 'button:hover'
 * - Universal selector: '*', 'h1 *'
 * - Pseudo-elements on root: '::before'
 * - Pseudo on sub-element: '@::before', '>@:hover'
 * - Classes: '.active', '>@.active'
 * - Multiple selectors: '>, >Body>'
 * - Sibling combinators (after element): '>Item+', '>Item~'
 */
function processAffix(affix: string, key: string): AffixResult {
  const trimmed = affix.trim();

  // Empty = default behavior (descendant selector with key)
  if (!trimmed) {
    return { valid: true, selectors: [` [data-element="${key}"]`] };
  }

  // Split by comma for multiple selectors
  const patterns = trimmed.split(',').map((p) => p.trim());
  const selectors: string[] = [];

  for (const pattern of patterns) {
    const validation = validatePattern(pattern);
    if (!validation.valid) {
      return validation;
    }

    const selector = processSinglePattern(pattern, key);
    selectors.push(selector);
  }

  return { valid: true, selectors };
}

/**
 * Recognized token patterns for selector affix validation.
 *
 * These patterns are used to tokenize and validate `$` affix strings.
 * Order matters: more specific patterns must come first to avoid
 * partial matches (e.g., `::before` must match before `:` alone).
 *
 * Unrecognized tokens (like `#id`, `*`, or numbers) will cause validation to fail.
 */
const VALID_TOKEN_PATTERNS = [
  /^[>+~]/, // Combinators: >, +, ~
  /^\*/, // Universal selector (*)
  /^[A-Z][a-zA-Z0-9]*/, // Uppercase element names → [data-element="..."]
  /^@/, // @ placeholder for key injection position
  /^::?[a-z][a-z0-9-]*(?:\([^)]*\))?/, // Pseudo-elements/classes (:hover, ::before, :not(.x))
  /^\.[a-zA-Z_-][a-zA-Z0-9_-]*/, // Class selectors (.active, .is-open)
  /^\[[^\]]+\]/, // Attribute selectors ([type="text"], [role])
  /^[a-z][a-z0-9-]*/, // HTML tag names (a, div, button, my-component)
  /^\s+/, // Whitespace (ignored during parsing)
  /^&/, // Root reference (stripped, kept for backward compat)
];

/**
 * Scan a pattern for unrecognized tokens.
 *
 * Iterates through the pattern, consuming recognized tokens until
 * either the pattern is fully consumed (valid) or an unrecognized
 * character sequence is found (invalid).
 *
 * @param pattern - The selector pattern to validate
 * @returns The first unrecognized token found, or null if all tokens are valid
 *
 * @example
 * findUnrecognizedTokens('>Body>Row>') // → null (valid)
 * findUnrecognizedTokens('123')         // → '123' (invalid)
 * findUnrecognizedTokens('#myId')       // → '#' (invalid)
 */
function findUnrecognizedTokens(pattern: string): string | null {
  let remaining = pattern;

  while (remaining.length > 0) {
    let matched = false;

    for (const regex of VALID_TOKEN_PATTERNS) {
      const match = remaining.match(regex);
      if (match) {
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Found unrecognized content - extract the problematic part
      const unrecognized = remaining.match(/^[^\s>+~@.:[\]A-Z]+/);
      return unrecognized ? unrecognized[0] : remaining[0];
    }
  }

  return null;
}

/**
 * Validate a selector pattern for structural correctness.
 *
 * Checks for:
 * 1. Out-of-scope selectors: Patterns starting with `+` or `~` target siblings
 *    of the root element, which is outside the component's DOM scope.
 * 2. Consecutive combinators: Patterns like `>>` or `>+` are malformed CSS.
 * 3. Unrecognized tokens: Characters/sequences not matching valid CSS selectors.
 *
 * @param pattern - A single selector pattern (already split by comma)
 * @returns AffixResult indicating validity and error reason if invalid
 *
 * @example
 * validatePattern('>Body>Row>')  // → { valid: true, selectors: [] }
 * validatePattern('+')           // → { valid: false, reason: '...outside root scope...' }
 * validatePattern('>>')          // → { valid: false, reason: '...consecutive combinators...' }
 */
function validatePattern(pattern: string): AffixResult {
  const trimmed = pattern.trim();

  // Patterns starting with + or ~ target siblings of the root element,
  // which is outside the component's scope. Valid sibling patterns must
  // be preceded by an element: ">Item+", ">Item~"
  if (/^[+~]/.test(trimmed)) {
    return {
      valid: false,
      reason:
        `Selector affix "${pattern}" targets elements outside the root scope. ` +
        `Sibling selectors (+, ~) must be preceded by an element inside the root. ` +
        `Use ">Element+" or ">Element~" instead.`,
    };
  }

  // Check for consecutive combinators
  if (/[>+~]{2,}/.test(trimmed.replace(/\s+/g, ''))) {
    return {
      valid: false,
      reason: `Selector affix "${pattern}" contains consecutive combinators.`,
    };
  }

  // Check for unrecognized tokens (e.g., lowercase text like "foo")
  const unrecognized = findUnrecognizedTokens(trimmed);
  if (unrecognized) {
    return {
      valid: false,
      reason:
        `Selector affix "${pattern}" contains unrecognized token "${unrecognized}". ` +
        `Valid tokens: combinators (>, +, ~), element names (Uppercase), ` +
        `@ placeholder, pseudo (:hover, ::before), class (.name), attribute ([attr]).`,
    };
  }

  return { valid: true, selectors: [] };
}

/**
 * Process a single selector pattern into a CSS selector suffix.
 *
 * This is the main transformation function that converts a `$` affix pattern
 * into a valid CSS selector suffix. It handles:
 *
 * 1. `@` placeholder replacement with `[data-element="key"]`
 * 2. Key injection based on pattern ending (see `shouldInjectKey`)
 * 3. Proper spacing for descendant vs direct child selectors
 *
 * @param pattern - A single validated selector pattern
 * @param key - The sub-element key to inject (e.g., 'Label', 'Cell')
 * @returns CSS selector suffix ready to append to the root selector
 *
 * @example
 * processSinglePattern('>', 'Row')
 * // → '> [data-element="Row"]'
 *
 * processSinglePattern('>Body>Row>', 'Cell')
 * // → '> [data-element="Body"] > [data-element="Row"] > [data-element="Cell"]'
 *
 * processSinglePattern('&::before', 'Before')
 * // → '::before' (& attaches pseudo directly to root, no key injection)
 *
 * processSinglePattern('>@:hover', 'Item')
 * // → '> [data-element="Item"]:hover'
 */
function processSinglePattern(pattern: string, key: string): string {
  // Explicit & means "attach directly to root" (no space prefix)
  const startsWithAmpersand = pattern.startsWith('&');
  const normalized = (startsWithAmpersand ? pattern.slice(1) : pattern).trim();

  if (!normalized) {
    return ` [data-element="${key}"]`;
  }

  // Pseudo-elements/classes at start (used for @ placeholder branch only)
  const startsWithPseudo = /^::?[a-z]/.test(normalized);

  // Transform the pattern: convert element names and normalize spacing
  let result = transformPattern(normalized);

  // Handle @ placeholder: explicit key injection position
  if (result.includes('@')) {
    // Remove space between @ and following class/pseudo for proper attachment
    // e.g., "@ .active" → "[el].active", but "@ > span" → "[el] > span"
    result = result.replace(/@ (?=[.:])/g, '@');
    result = result.replace(/@/g, `[data-element="${key}"]`);

    if (!startsWithPseudo && !result.startsWith(' ')) {
      result = ' ' + result;
    }
    return result;
  }

  // Auto-inject key based on pattern ending (see shouldInjectKey for rules)
  if (shouldInjectKey(normalized, key)) {
    result = result + ' ' + `[data-element="${key}"]`;
  }

  // & prefix skips space so the suffix attaches directly to the root selector
  if (!startsWithAmpersand && !result.startsWith(' ')) {
    result = ' ' + result;
  }

  return result;
}

/**
 * Transform a selector pattern by converting element names and normalizing spacing.
 *
 * This is a character-by-character tokenizer that:
 * - Converts uppercase names to `[data-element="Name"]` selectors
 * - Adds proper spacing around combinators (>, +, ~)
 * - Preserves lowercase tags, classes, pseudos, and attributes as-is
 * - Keeps @ placeholder for later replacement
 *
 * The tokenizer handles these token types in order:
 * 1. Whitespace (skipped)
 * 2. Combinators: >, +, ~ (add surrounding spaces)
 * 3. Universal selector: * (keep as-is with spacing)
 * 4. Uppercase names: Body, Row (convert to [data-element="..."])
 * 5. @ placeholder (keep for later replacement)
 * 6. Pseudo: :hover, ::before (attach to previous token)
 * 7. Tags: a, div, button (keep as-is with spacing)
 * 8. Classes: .active (attach to previous element/tag/placeholder)
 * 9. Attributes: [type="text"] (keep as-is)
 *
 * @param pattern - The raw selector pattern to transform
 * @returns Transformed pattern with proper CSS selector syntax
 *
 * @example
 * transformPattern('>Body>Row>')
 * // → '> [data-element="Body"] > [data-element="Row"] >'
 *
 * transformPattern('button.primary:hover')
 * // → 'button.primary:hover'
 */
function transformPattern(pattern: string): string {
  let result = '';
  let lastCh = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (/[>+~]/.test(char)) {
      if (result && lastCh !== ' ') {
        result += ' ';
      }
      result += char;
      lastCh = char;
      i++;
      continue;
    }

    if (char === '*') {
      if (result && lastCh !== ' ') {
        result += ' ';
      }
      result += '*';
      lastCh = '*';
      i++;
      continue;
    }

    if (/[A-Z]/.test(char)) {
      const nameStart = i;
      while (i < pattern.length && /[a-zA-Z0-9]/.test(pattern[i])) {
        i++;
      }
      if (result && lastCh !== ' ') {
        result += ' ';
      }
      const segment = `[data-element="${pattern.slice(nameStart, i)}"]`;
      result += segment;
      lastCh = ']';
      continue;
    }

    if (char === '@') {
      if (result && lastCh !== ' ') {
        result += ' ';
      }
      result += '@';
      lastCh = '@';
      i++;
      continue;
    }

    if (char === ':') {
      const pseudoStart = i;
      while (
        i < pattern.length &&
        !/[\s>+~,@]/.test(pattern[i]) &&
        !/[A-Z]/.test(pattern[i])
      ) {
        i++;
      }
      const segment = pattern.slice(pseudoStart, i);
      result += segment;
      lastCh = segment[segment.length - 1] || lastCh;
      continue;
    }

    if (/[a-z]/.test(char)) {
      const tagStart = i;
      while (i < pattern.length && /[a-z0-9-]/.test(pattern[i])) {
        i++;
      }
      if (result && lastCh !== ' ') {
        result += ' ';
      }
      const segment = pattern.slice(tagStart, i);
      result += segment;
      lastCh = segment[segment.length - 1] || lastCh;
      continue;
    }

    if (char === '.') {
      const attachToLast =
        lastCh === ']' || lastCh === '@' || /[a-zA-Z0-9-]/.test(lastCh);
      if (result && !attachToLast && lastCh !== ' ') {
        result += ' ';
      }
      const clsStart = i;
      i++;
      while (i < pattern.length && /[a-zA-Z0-9_-]/.test(pattern[i])) {
        i++;
      }
      const segment = pattern.slice(clsStart, i);
      result += segment;
      lastCh = segment[segment.length - 1] || lastCh;
      continue;
    }

    if (char === '[') {
      const attachToLast =
        lastCh === ']' || lastCh === '@' || /[a-zA-Z0-9-]/.test(lastCh);
      if (result && !attachToLast && lastCh !== ' ') {
        result += ' ';
      }
      const attrStart = i;
      let depth = 0;
      while (i < pattern.length) {
        if (pattern[i] === '[') depth++;
        if (pattern[i] === ']') depth--;
        i++;
        if (depth === 0) break;
      }
      result += pattern.slice(attrStart, i);
      lastCh = ']';
      continue;
    }

    result += char;
    lastCh = char;
    i++;
  }

  return result;
}

/**
 * Determine if the sub-element key should be auto-injected based on pattern ending.
 *
 * Key injection rules (when no @ placeholder is present):
 *
 * | Pattern Ending | Inject Key? | Example | Result |
 * |----------------|-------------|---------|--------|
 * | Combinator (>, +, ~) | Yes | `'>Body>'` | `> [data-element="Body"] > [el]` |
 * | Uppercase element | Yes | `'>Body>Row'` | `> [el1] > [el2] [key]` |
 * | Lowercase tag | No | `'h1'` | ` h1` |
 * | Universal (*) | No | `'h1 *'` | ` h1 *` |
 * | Pseudo (:hover, ::before) | No | `'::before'` | `::before` |
 * | Class (.active) | No | `'.active'` | `.active` |
 * | Attribute ([type]) | No | `'[type="text"]'` | `[type="text"]` |
 *
 * @param pattern - The normalized pattern (after stripping &)
 * @param key - The sub-element key being styled. If the trailing element name
 *              equals this key, it acts as an explicit placeholder for the key
 *              (same role as `@`) and no auto-injection happens.
 * @returns true if key should be injected, false otherwise
 *
 * @example
 * shouldInjectKey('>', 'Key')            // → true (trailing combinator)
 * shouldInjectKey('>Body>Row', 'Key')    // → true (ends with different element)
 * shouldInjectKey('>Body>Key', 'Key')    // → false (trailing name === key)
 * shouldInjectKey('Key', 'Key')          // → false (sole element === key)
 * shouldInjectKey('h1', 'Key')           // → false (ends with tag)
 * shouldInjectKey('*', 'Key')            // → false (universal selector)
 * shouldInjectKey('::before', 'Key')     // → false (ends with pseudo)
 * shouldInjectKey('.active', 'Key')      // → false (ends with class)
 * shouldInjectKey('a:hover', 'Key')      // → false (ends with pseudo)
 * shouldInjectKey('button.primary', 'Key') // → false (ends with class)
 */
function shouldInjectKey(pattern: string, key: string): boolean {
  const trimmed = pattern.trim();

  // Rule 1: Ends with combinator → inject key after it
  // e.g., '>' → '> [data-element="Key"]'
  if (/[>+~]$/.test(trimmed)) {
    return true;
  }

  // Rule 2: Ends with uppercase element name. The lookbehind ensures we're
  // matching a standalone element name, not part of a class like .myClass.
  // If that trailing name is the sub-element's own key, it already represents
  // the target element (acts like the `@` placeholder) — no re-injection.
  // Otherwise inject the key as a descendant of the trailing element.
  // e.g., '>Body' (key=Cell)  → '> [data-element="Body"] [data-element="Cell"]'
  //       '>Body>Cell' (key=Cell) → '> [data-element="Body"] > [data-element="Cell"]'
  const trailingElement = trimmed.match(/(?:^|[\s>+~\]:])([A-Z][a-zA-Z0-9]*)$/);
  if (trailingElement) {
    return trailingElement[1] !== key;
  }

  // Otherwise (tags, universal *, pseudo, class, attribute) → no injection
  // The pattern is complete as-is, applying to root or a specific selector
  return false;
}

/**
 * Normalize selector suffix from $ property
 */
function normalizeSelectorSuffix(suffix: string): string {
  if (!suffix) return '';
  return suffix.startsWith('&') ? suffix.slice(1) : suffix;
}

/**
 * Build handler queue from style keys
 */
function buildHandlerQueue(
  styleKeys: string[],
  styles: Styles,
): { handler: StyleHandler; styleMap: StyleMap }[] {
  const queue: { handler: StyleHandler; styleMap: StyleMap }[] = [];
  const seenHandlers = new Set<StyleHandler>();

  for (const styleName of styleKeys) {
    let handlers: StyleHandler[] = STYLE_HANDLER_MAP[styleName];

    if (!handlers) {
      handlers = STYLE_HANDLER_MAP[styleName] = [createStyle(styleName)];
    }

    for (const handler of handlers) {
      if (seenHandlers.has(handler)) continue;
      seenHandlers.add(handler);

      const lookupStyles = handler.__lookupStyles;
      const styleMap: StyleMap = {};

      for (const name of lookupStyles) {
        const val = styles[name];
        if (val !== undefined) {
          styleMap[name] = val as StyleValue | StyleValueStateMap;
        }
      }

      queue.push({ handler, styleMap });
    }
  }

  return queue;
}

/**
 * Compute all valid state combinations for a handler's lookup styles
 */
function computeStateCombinations(
  exclusiveByStyle: Map<string, ExclusiveStyleEntry[]>,
  lookupStyles: string[],
): {
  condition: ConditionNode;
  values: Record<string, StyleValue>;
  order: number;
}[] {
  // Get entries for each style
  const entriesPerStyle = lookupStyles.map(
    (style) => exclusiveByStyle.get(style) || [],
  );

  // Cartesian product of all combinations
  const combinations = cartesianProduct(entriesPerStyle);

  // Build snapshots, simplifying and filtering impossible combinations
  const snapshots: {
    condition: ConditionNode;
    values: Record<string, StyleValue>;
    order: number;
  }[] = [];

  for (const combo of combinations) {
    // Combine all exclusive conditions with AND
    const conditions = combo.map((e) => e.exclusiveCondition);
    const combined = and(...conditions);
    const simplified = simplifyCondition(combined);

    // Skip impossible combinations
    if (simplified.kind === 'false') continue;

    // Build values map
    const values: Record<string, StyleValue> = {};
    // Cascade order = highest source priority among the contributing entries.
    let order = 0;
    for (const entry of combo) {
      values[entry.styleKey] = entry.value;
      if (entry.priority > order) order = entry.priority;
    }

    snapshots.push({
      condition: simplified,
      values,
      order,
    });
  }

  return snapshots;
}

/**
 * Cartesian product of arrays
 */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];

  const nonEmpty = arrays.filter((a) => a.length > 0);
  if (nonEmpty.length === 0) return [[]];

  let result: T[][] = [[]];
  for (const arr of nonEmpty) {
    const next: T[][] = [];
    for (const combo of result) {
      for (const item of arr) {
        const newCombo = new Array<T>(combo.length + 1);
        for (let i = 0; i < combo.length; i++) newCombo[i] = combo[i];
        newCombo[combo.length] = item;
        next.push(newCombo);
      }
    }
    result = next;
  }
  return result;
}

const declStringCache = new WeakMap<Record<string, string>, string>();

function stringifyDeclarations(decl: Record<string, string>): string {
  let cached = declStringCache.get(decl);
  if (cached === undefined) {
    cached = JSON.stringify(decl);
    declStringCache.set(decl, cached);
  }
  return cached;
}

/**
 * Merge rules with identical CSS output
 */
function mergeByValue(rules: ComputedRule[]): ComputedRule[] {
  const groups = new Map<string, ComputedRule[]>();

  for (const rule of rules) {
    const key = `${rule.selectorSuffix}|${stringifyDeclarations(rule.declarations)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(rule);
  }

  // Merge conditions with OR for each group
  const merged: ComputedRule[] = [];

  for (const [, groupRules] of groups) {
    if (groupRules.length === 1) {
      merged.push(groupRules[0]);
    } else {
      // Merge conditions with OR
      const mergedCondition = simplifyCondition(
        or(...groupRules.map((r) => r.condition)),
      );
      // Take the lowest order so a merged group carrying a fallback's value
      // keeps the fallback's early cascade position.
      let order = groupRules[0].order;
      for (const r of groupRules) if (r.order < order) order = r.order;
      merged.push({
        condition: mergedCondition,
        declarations: groupRules[0].declarations,
        selectorSuffix: groupRules[0].selectorSuffix,
        order,
      });
    }
  }

  return merged;
}

/**
 * Build selector fragment from a variant (without className prefix)
 */
function buildSelectorFromVariant(
  variant: SelectorVariant,
  selectorSuffix: string,
): string {
  let selector = '';

  // Root-element state segment: flat modifiers/pseudos + :is()/:not()
  // groups, all attaching to the root element. Combine into a single
  // `:where(...)` so the whole segment carries zero specificity (the
  // doubled class is the only anchor). See `wrapWhere`.
  let rootSegment = branchToCSS([
    ...variant.modifierConditions,
    ...variant.pseudoConditions,
  ]);
  for (const group of variant.selectorGroups) {
    rootSegment += selectorGroupToCSS(group);
  }
  selector += wrapWhere(rootSegment);

  // Add parent selectors (before sub-element suffix). parentGroupsToCSS
  // already wraps each group in :where() so ancestor state adds no
  // specificity.
  if (variant.parentGroups.length > 0) {
    selector += parentGroupsToCSS(variant.parentGroups);
  }

  selector += selectorSuffix;

  // Sub-element (own) state segment: wrapped in its own separate
  // `:where(...)` so the sub-element's own structural specificity
  // ([data-element="X"]) is preserved while its states are zeroed.
  const ownOptimized = optimizeGroups(variant.ownGroups);
  let ownSegment = '';
  for (const group of ownOptimized) {
    ownSegment += selectorGroupToCSS(group);
  }
  selector += wrapWhere(ownSegment);

  return selector;
}

/**
 * Materialize a computed rule to final CSS format
 *
 * Returns an array because OR conditions may generate multiple CSS rules
 * (when different branches have different at-rules)
 */
function materializeComputedRule(rule: ComputedRule): CSSRule[] {
  const components = conditionToCSS(rule.condition);

  if (components.isImpossible || components.variants.length === 0) {
    return [];
  }

  const declarations = Object.entries(rule.declarations)
    .map(([prop, value]) => `${prop}: ${value};`)
    .join(' ');

  // Helper to get root prefix key for grouping
  const getRootPrefixKey = (variant: SelectorVariant): string => {
    return rootGroupsToCSS(variant.rootGroups) || '';
  };

  // Group variants by their at-rules + startingStyle (variants with same context can be combined with commas)
  const byAtRules = new Map<
    string,
    {
      variants: SelectorVariant[];
      atRules: string[];
      rootPrefix?: string;
      startingStyle?: boolean;
    }
  >();

  for (const variant of components.variants) {
    const atRules = buildAtRulesFromVariant(variant);
    const startingStyle = variant.startingStyle;
    const key =
      atRules.sort().join('|||') +
      '###' +
      getRootPrefixKey(variant) +
      '###' +
      (startingStyle ? '1' : '0');

    const group = byAtRules.get(key);
    if (group) {
      group.variants.push(variant);
    } else {
      byAtRules.set(key, {
        variants: [variant],
        atRules,
        rootPrefix: rootGroupsToCSS(variant.rootGroups),
        startingStyle: startingStyle || undefined,
      });
    }
  }

  // Generate one CSSRule per at-rules group
  const rules: CSSRule[] = [];
  for (const [, group] of byAtRules) {
    // Merge variants that differ only in flat modifier/pseudo conditions
    // into :is() groups before building selector strings
    const mergedVariants = mergeVariantsIntoSelectorGroups(group.variants);

    // Build selector fragments for each variant (will be joined with className later)
    const selectorFragments = mergedVariants.map((v) =>
      buildSelectorFromVariant(v, rule.selectorSuffix),
    );

    // Store as array if multiple, string if single
    const selector =
      selectorFragments.length === 1 ? selectorFragments[0] : selectorFragments;

    const cssRule: CSSRule = {
      selector,
      declarations,
      order: rule.order,
    };

    if (group.atRules.length > 0) {
      cssRule.atRules = group.atRules;
    }

    if (group.rootPrefix) {
      cssRule.rootPrefix = group.rootPrefix;
    }

    if (group.startingStyle) {
      cssRule.startingStyle = true;
    }

    rules.push(cssRule);
  }

  return rules;
}

// ============================================================================
// StyleResult merging (group by selector + at-rules)
// ============================================================================

/**
 * Merge StyleResult entries that share the same selector and at-rules,
 * concatenating their declarations into a single rule.
 *
 * This reduces CSS output size when many style keys (e.g. design tokens)
 * resolve to the same selector/state combination.
 */
function mergeStyleResults(results: StyleResult[]): StyleResult[] {
  if (results.length <= 1) return results;

  const groups = new Map<string, StyleResult>();

  for (const result of results) {
    const atKey = result.atRules?.join('|') ?? '';
    const key = `${atKey}||${result.selector}||${result.startingStyle ? '1' : '0'}`;

    const existing = groups.get(key);
    if (existing) {
      existing.declarations = existing.declarations
        ? `${existing.declarations} ${result.declarations}`
        : result.declarations;
    } else {
      groups.set(key, { ...result });
    }
  }

  return Array.from(groups.values());
}

// ============================================================================
// Public API: renderStyles (compatible with old API)
// ============================================================================

/**
 * Options for renderStyles when using direct selector mode.
 */
interface RenderStylesOptions {
  /**
   * Whether to double the class selector for increased specificity.
   * When true, `.myClass` becomes `.myClass.myClass` for higher specificity.
   *
   * @default false - User-provided selectors are not doubled.
   *
   * Note: This only applies when a classNameOrSelector is provided.
   * When renderStyles returns RenderResult with needsClassName=true,
   * the injector handles doubling automatically.
   */
  doubleSelector?: boolean;
}

/**
 * Render styles to CSS rules.
 *
 * When called without classNameOrSelector, returns RenderResult with needsClassName=true.
 * When called with a selector/className string, returns StyleResult[] for direct injection.
 */
export function renderStyles(
  styles?: Styles,
  classNameOrSelector?: undefined,
  options?: undefined,
  pipelineCacheKey?: string,
): RenderResult;
export function renderStyles(
  styles: Styles | undefined,
  classNameOrSelector: string,
  options?: RenderStylesOptions,
): StyleResult[];
export function renderStyles(
  styles?: Styles,
  classNameOrSelector?: string,
  options?: RenderStylesOptions,
  pipelineCacheKey?: string,
): RenderResult | StyleResult[] {
  // Check if we have a direct selector/className
  const directSelector = !!classNameOrSelector;

  // Check cache first when a pre-computed key is available.
  // This allows callers to skip building the styles object on cache hit.
  let rules: CSSRule[] | undefined;
  if (pipelineCacheKey) {
    rules = pipelineCache.get(pipelineCacheKey);
  }

  if (!rules && !styles) {
    return directSelector ? [] : { rules: [] };
  }

  // Use pre-computed cache key when available (from chunk path),
  // falling back to stringifyStyles for direct renderStyles() calls
  const cacheKey = pipelineCacheKey || stringifyStyles(styles!);
  if (!rules) {
    rules = pipelineCache.get(cacheKey);
  }

  if (!rules) {
    // styles is guaranteed non-null here: early return above handles (!rules && !styles)
    const parserContext = createStateParserContext(styles!);
    rules = runPipeline(styles!, parserContext);
    pipelineCache.set(cacheKey, rules);
  }

  // Direct selector/className mode: return StyleResult[] directly
  if (directSelector) {
    const shouldDouble = options?.doubleSelector ?? false;

    const results = rules.map((rule): StyleResult => {
      // Handle selector as array (OR conditions) or string
      const selectorParts = Array.isArray(rule.selector)
        ? rule.selector
        : rule.selector
          ? [rule.selector]
          : [''];

      const finalSelector = selectorParts
        .map((part) => {
          let sel = part
            ? `${classNameOrSelector}${part}`
            : classNameOrSelector;

          // Double class selector for increased specificity if requested
          // This is used when the caller explicitly wants higher specificity
          if (shouldDouble && sel.startsWith('.')) {
            const classMatch = sel.match(/^\.[a-zA-Z_-][a-zA-Z0-9_-]*/);
            if (classMatch) {
              const baseClass = classMatch[0];
              sel = baseClass + sel;
            }
          }

          // Handle root prefix for this selector
          if (rule.rootPrefix) {
            sel = `${rule.rootPrefix} ${sel}`;
          }

          return sel;
        })
        .join(', ');

      const result: StyleResult = {
        selector: finalSelector,
        declarations: rule.declarations,
      };

      if (rule.atRules && rule.atRules.length > 0) {
        result.atRules = rule.atRules;
      }

      if (rule.startingStyle) {
        result.startingStyle = true;
      }

      return result;
    });

    return mergeStyleResults(results);
  }

  // No className mode: return RenderResult with needsClassName flag
  // Normalize selector to string (join array with placeholder that injector will handle)
  return {
    rules: rules.map(
      (r): StyleResult => ({
        selector: Array.isArray(r.selector)
          ? r.selector.join('|||')
          : r.selector,
        declarations: r.declarations,
        atRules: r.atRules,
        needsClassName: true,
        rootPrefix: r.rootPrefix,
        startingStyle: r.startingStyle,
      }),
    ),
  };
}

export type { ConditionNode } from './conditions';
export { parseStateKey } from './parseStateKey';
