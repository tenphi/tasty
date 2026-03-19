/**
 * CSS Materialization
 *
 * Converts condition trees into CSS selectors and at-rules.
 * This is the final stage that produces actual CSS output.
 */

import { Lru } from '../parser/lru';

import type {
  ConditionNode,
  ContainerCondition,
  MediaCondition,
  ModifierCondition,
  PseudoCondition,
  StateCondition,
  SupportsCondition,
} from './conditions';
import { getConditionUniqueId } from './conditions';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed media condition for structured analysis and combination
 */
export interface ParsedMediaCondition {
  /** Subtype for structured analysis */
  subtype: 'dimension' | 'feature' | 'type';
  /** Whether this is a negated condition */
  negated: boolean;
  /** The condition part for CSS output (e.g., "(width < 600px)", "print") */
  condition: string;
  /** For dimension queries: dimension name */
  dimension?: 'width' | 'height' | 'inline-size' | 'block-size';
  /** For dimension queries: lower bound value */
  lowerBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  };
  /** For dimension queries: upper bound value */
  upperBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  };
  /** For feature queries: feature name */
  feature?: string;
  /** For feature queries: feature value */
  featureValue?: string;
  /** For type queries: media type */
  mediaType?: 'print' | 'screen' | 'all' | 'speech';
}

/**
 * Parsed container condition for structured analysis and combination
 */
export interface ParsedContainerCondition {
  /** Container name (undefined = unnamed/nearest container) */
  name?: string;
  /** The condition part (e.g., "(width < 600px)" or "style(--variant: danger)") */
  condition: string;
  /** Whether this is a negated condition */
  negated: boolean;
  /** Subtype for structured analysis */
  subtype: 'dimension' | 'style' | 'raw';
  /** For style queries: property name (without --) */
  property?: string;
  /** For style queries: property value (undefined = existence check) */
  propertyValue?: string;
}

/**
 * Parsed supports condition for structured analysis and combination
 */
export interface ParsedSupportsCondition {
  /** Subtype: 'feature' for property support, 'selector' for selector() support */
  subtype: 'feature' | 'selector';
  /** The condition string (e.g., "display: grid" or ":has(*)") */
  condition: string;
  /** Whether this is a negated condition */
  negated: boolean;
}

/**
 * Parsed modifier condition for structured analysis
 */
export interface ParsedModifierCondition {
  /** Attribute name (e.g., 'data-hovered', 'data-size') */
  attribute: string;
  /** Value if present (e.g., 'large', 'danger') */
  value?: string;
  /** Operator for value matching (default '=') */
  operator?: '=' | '^=' | '$=' | '*=';
  /** Whether this is negated (:not(...)) */
  negated: boolean;
}

/**
 * Parsed pseudo-class condition for structured analysis
 */
export interface ParsedPseudoCondition {
  /** The pseudo-class (e.g., ':hover', ':focus-visible', ':has(> Icon)') */
  pseudo: string;
  /** Whether this is negated (:not(...)) */
  negated: boolean;
}

/** Modifier or pseudo condition (shared across own/root/parent) */
type ParsedSelectorCondition = ParsedModifierCondition | ParsedPseudoCondition;

/**
 * A group of selector conditions that produces an :is() or :not() wrapper.
 *
 * Each branch is an AND conjunction of conditions (one selector fragment).
 * Multiple branches are OR'd together inside the :is()/:not() wrapper.
 *
 * Example: size=small | size=medium
 *   branches: [[size=small], [size=medium]]
 *   renders:  :is([data-size="small"], [data-size="medium"])
 *
 * When negated, :is() becomes :not():
 *   :not([data-size="small"], [data-size="medium"])
 *
 * Single-branch groups are unwrapped (no :is() wrapper):
 *   branches: [[size=small]]
 *   renders:  [data-size="small"]
 */
export interface SelectorGroup {
  branches: ParsedSelectorCondition[][];
  negated: boolean;
}

/**
 * A group of parent conditions originating from a single @parent() call.
 * Each group produces its own :is()/:not() wrapper in the final CSS.
 * Separate @parent() calls = separate groups = can match different ancestors.
 *
 * Extends SelectorGroup with a `direct` flag for ancestor combinator:
 *   direct = false → ` *` (any ancestor)
 *   direct = true  → ` > *` (direct parent only)
 *
 * Example: @parent(hovered & pressed | active)
 *   branches: [[hovered, pressed], [active]]
 *   renders:  :is([data-hovered][data-pressed] *, [data-active] *)
 */
export interface ParentGroup extends SelectorGroup {
  direct: boolean;
}

/**
 * A single selector variant (one term in a DNF expression)
 */
export interface SelectorVariant {
  /** Structured modifier conditions (flat AND) */
  modifierConditions: ParsedModifierCondition[];

  /** Structured pseudo conditions (flat AND) */
  pseudoConditions: ParsedPseudoCondition[];

  /** Selector groups — :is()/:not() wrappers for OR branches on the element */
  selectorGroups: SelectorGroup[];

  /** Own groups — :is()/:not() wrappers for @own() OR branches on sub-elements */
  ownGroups: SelectorGroup[];

  /** Parsed media conditions for structured combination */
  mediaConditions: ParsedMediaCondition[];

  /** Parsed container conditions for structured combination */
  containerConditions: ParsedContainerCondition[];

  /** Parsed supports conditions for @supports at-rules */
  supportsConditions: ParsedSupportsCondition[];

  /** Root groups — :is()/:not() wrappers for @root() OR branches */
  rootGroups: SelectorGroup[];

  /** Parent condition groups — each @parent() call is a separate group */
  parentGroups: ParentGroup[];

  /** Whether to wrap in @starting-style */
  startingStyle: boolean;
}

/**
 * CSS output components extracted from a condition
 * Supports multiple variants for OR conditions (DNF form)
 */
export interface CSSComponents {
  /** Selector variants - OR means multiple variants, AND means single variant with combined selectors */
  variants: SelectorVariant[];

  /** Whether condition is impossible (should skip) */
  isImpossible: boolean;
}

/**
 * Final CSS rule output
 */
export interface CSSRule {
  /** Single selector or array of selector fragments (for OR conditions) */
  selector: string | string[];
  declarations: string;
  atRules?: string[];
  rootPrefix?: string;
}

// ============================================================================
// Caching
// ============================================================================

const conditionCache = new Lru<string, CSSComponents>(3000);

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Convert a condition tree to CSS components
 */
export function conditionToCSS(node: ConditionNode): CSSComponents {
  // Check cache
  const key = getConditionUniqueId(node);
  const cached = conditionCache.get(key);
  if (cached) {
    return cached;
  }

  const result = conditionToCSSInner(node);

  // Cache result
  conditionCache.set(key, result);

  return result;
}

/**
 * Clear the condition cache (for testing)
 */
export function clearConditionCache(): void {
  conditionCache.clear();
}

// ============================================================================
// Inner Implementation
// ============================================================================

function emptyVariant(): SelectorVariant {
  return {
    modifierConditions: [],
    pseudoConditions: [],
    selectorGroups: [],
    ownGroups: [],
    mediaConditions: [],
    containerConditions: [],
    supportsConditions: [],
    rootGroups: [],
    parentGroups: [],
    startingStyle: false,
  };
}

function conditionToCSSInner(node: ConditionNode): CSSComponents {
  // Base case: TRUE condition - single empty variant (matches everything)
  if (node.kind === 'true') {
    return {
      variants: [emptyVariant()],
      isImpossible: false,
    };
  }

  // Base case: FALSE condition - no variants (matches nothing)
  if (node.kind === 'false') {
    return {
      variants: [],
      isImpossible: true,
    };
  }

  // State condition
  if (node.kind === 'state') {
    return stateToCSS(node);
  }

  // Compound condition
  if (node.kind === 'compound') {
    if (node.operator === 'AND') {
      return andToCSS(node.children);
    } else {
      return orToCSS(node.children);
    }
  }

  // Fallback - single empty variant
  return {
    variants: [emptyVariant()],
    isImpossible: false,
  };
}

/**
 * Convert a state condition to CSS
 */
function stateToCSS(state: StateCondition): CSSComponents {
  switch (state.type) {
    case 'media': {
      const mediaResults = mediaToParsed(state);
      const variants = mediaResults.map((mediaCond) => {
        const v = emptyVariant();
        v.mediaConditions.push(mediaCond);
        return v;
      });
      return { variants, isImpossible: false };
    }

    case 'root':
      return innerConditionToVariants(
        state.innerCondition,
        state.negated ?? false,
        'rootGroups',
      );

    case 'parent':
      return parentConditionToVariants(
        state.innerCondition,
        state.negated ?? false,
        state.direct,
      );

    case 'own':
      return innerConditionToVariants(
        state.innerCondition,
        state.negated ?? false,
        'ownGroups',
      );

    case 'modifier': {
      const v = emptyVariant();
      v.modifierConditions.push(modifierToParsed(state));
      return { variants: [v], isImpossible: false };
    }

    case 'pseudo': {
      const v = emptyVariant();
      v.pseudoConditions.push(pseudoToParsed(state));
      return { variants: [v], isImpossible: false };
    }

    case 'container': {
      const v = emptyVariant();
      v.containerConditions.push(containerToParsed(state));
      return { variants: [v], isImpossible: false };
    }

    case 'supports': {
      const v = emptyVariant();
      v.supportsConditions.push(supportsToParsed(state));
      return { variants: [v], isImpossible: false };
    }

    case 'starting': {
      const v = emptyVariant();
      v.startingStyle = !state.negated;
      return { variants: [v], isImpossible: false };
    }
  }
}

/**
 * Convert modifier condition to parsed structure
 */
function modifierToParsed(state: ModifierCondition): ParsedModifierCondition {
  return {
    attribute: state.attribute,
    value: state.value,
    operator: state.operator,
    negated: state.negated ?? false,
  };
}

/**
 * Convert parsed modifier to CSS selector string (for final output)
 */
export function modifierToCSS(mod: ParsedModifierCondition): string {
  let selector: string;

  if (mod.value !== undefined) {
    // Value attribute: [data-attr="value"]
    const op = mod.operator || '=';
    selector = `[${mod.attribute}${op}"${mod.value}"]`;
  } else {
    // Boolean attribute: [data-attr]
    selector = `[${mod.attribute}]`;
  }

  if (mod.negated) {
    return `:not(${selector})`;
  }
  return selector;
}

/**
 * Convert pseudo condition to parsed structure
 */
function pseudoToParsed(state: PseudoCondition): ParsedPseudoCondition {
  return {
    pseudo: state.pseudo,
    negated: state.negated ?? false,
  };
}

/**
 * Convert parsed pseudo to CSS selector string (for final output).
 *
 * :not() is normalized to negated :is() at parse time, so pseudo.pseudo
 * never starts with ':not(' here. When negated:
 * - :is(X) → :not(X)     (unwrap :is)
 * - :where(X) → :not(X)  (unwrap :where)
 * - :has(X) → :not(:has(X))
 * - other → :not(other)
 *
 * When not negated, single-argument :is()/:where() is unwrapped when the
 * inner content is a simple compound selector that can safely append to
 * the base selector (this happens after double-negation of :not()).
 */
export function pseudoToCSS(pseudo: ParsedPseudoCondition): string {
  const p = pseudo.pseudo;

  if (pseudo.negated) {
    if (p.startsWith(':is(') || p.startsWith(':where(')) {
      return `:not(${p.slice(p.indexOf('(') + 1, -1)})`;
    }
    return `:not(${p})`;
  }

  if ((p.startsWith(':is(') || p.startsWith(':where(')) && !p.includes(',')) {
    const inner = p.slice(p.indexOf('(') + 1, -1);
    const ch = inner[0];

    // Only unwrap when the inner content is a simple compound selector:
    // must start with a compoundable character and contain no whitespace
    // (whitespace implies combinators like `>`, `+`, `~`, or descendant).
    if (
      (ch === ':' || ch === '.' || ch === '[' || ch === '#') &&
      !/\s/.test(inner)
    ) {
      return inner;
    }
  }

  return p;
}

/**
 * Convert media condition to parsed structure(s)
 * Returns an array because negated ranges produce OR branches (two separate conditions)
 */
function mediaToParsed(state: MediaCondition): ParsedMediaCondition[] {
  if (state.subtype === 'type') {
    // @media:print → @media print (or @media not print)
    const mediaType = state.mediaType || 'all';
    return [
      {
        subtype: 'type',
        negated: state.negated ?? false,
        condition: mediaType,
        mediaType: state.mediaType,
      },
    ];
  } else if (state.subtype === 'feature') {
    // @media(prefers-contrast: high) → @media (prefers-contrast: high)
    let condition: string;
    if (state.featureValue) {
      condition = `(${state.feature}: ${state.featureValue})`;
    } else {
      condition = `(${state.feature})`;
    }
    return [
      {
        subtype: 'feature',
        negated: state.negated ?? false,
        condition,
        feature: state.feature,
        featureValue: state.featureValue,
      },
    ];
  } else {
    // Dimension query - negation is handled by inverting the condition
    // because "not (width < x)" doesn't work reliably in browsers
    return dimensionToMediaParsed(
      state.dimension || 'width',
      state.lowerBound,
      state.upperBound,
      state.negated ?? false,
    );
  }
}

/**
 * Convert dimension bounds to parsed media condition(s)
 * Uses CSS Media Queries Level 4 `not (condition)` syntax for negation.
 */
function dimensionToMediaParsed(
  dimension: 'width' | 'height' | 'inline-size' | 'block-size',
  lowerBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  },
  upperBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  },
  negated?: boolean,
): ParsedMediaCondition[] {
  // Build the condition string
  let condition: string;
  if (lowerBound && upperBound) {
    const lowerOp = lowerBound.inclusive ? '<=' : '<';
    const upperOp = upperBound.inclusive ? '<=' : '<';
    condition = `(${lowerBound.value} ${lowerOp} ${dimension} ${upperOp} ${upperBound.value})`;
  } else if (upperBound) {
    const op = upperBound.inclusive ? '<=' : '<';
    condition = `(${dimension} ${op} ${upperBound.value})`;
  } else if (lowerBound) {
    const op = lowerBound.inclusive ? '>=' : '>';
    condition = `(${dimension} ${op} ${lowerBound.value})`;
  } else {
    condition = `(${dimension})`;
  }

  // For negation, we use CSS `not (condition)` syntax in buildAtRulesFromVariant
  return [
    {
      subtype: 'dimension',
      negated: negated ?? false,
      condition,
      dimension,
      lowerBound,
      upperBound,
    },
  ];
}

/**
 * Convert container condition to parsed structure
 * This enables structured analysis for contradiction detection and condition combining
 */
function containerToParsed(
  state: ContainerCondition,
): ParsedContainerCondition {
  let condition: string;

  if (state.subtype === 'style') {
    // Style query: style(--prop: value)
    if (state.propertyValue) {
      condition = `style(--${state.property}: ${state.propertyValue})`;
    } else {
      condition = `style(--${state.property})`;
    }
  } else if (state.subtype === 'raw') {
    // Raw function query: passed through verbatim (e.g., scroll-state(stuck: top))
    condition = state.rawCondition!;
  } else {
    // Dimension query
    condition = dimensionToContainerCondition(
      state.dimension || 'width',
      state.lowerBound,
      state.upperBound,
    );
  }

  return {
    name: state.containerName,
    condition,
    negated: state.negated ?? false,
    subtype: state.subtype,
    property: state.property,
    propertyValue: state.propertyValue,
  };
}

/**
 * Convert dimension bounds to container query condition (single string)
 * Container queries support "not (condition)", so no need to invert manually
 */
function dimensionToContainerCondition(
  dimension: string,
  lowerBound?: { value: string; inclusive: boolean },
  upperBound?: { value: string; inclusive: boolean },
): string {
  if (lowerBound && upperBound) {
    const lowerOp = lowerBound.inclusive ? '<=' : '<';
    const upperOp = upperBound.inclusive ? '<=' : '<';
    return `(${lowerBound.value} ${lowerOp} ${dimension} ${upperOp} ${upperBound.value})`;
  } else if (upperBound) {
    const op = upperBound.inclusive ? '<=' : '<';
    return `(${dimension} ${op} ${upperBound.value})`;
  } else if (lowerBound) {
    const op = lowerBound.inclusive ? '>=' : '>';
    return `(${dimension} ${op} ${lowerBound.value})`;
  }
  return '(width)'; // Fallback
}

/**
 * Convert supports condition to parsed structure
 */
function supportsToParsed(state: SupportsCondition): ParsedSupportsCondition {
  return {
    subtype: state.subtype,
    condition: state.condition,
    negated: state.negated ?? false,
  };
}

/**
 * Collect all modifier and pseudo conditions from a variant as a flat array.
 */
function collectSelectorConditions(
  variant: SelectorVariant,
): ParsedSelectorCondition[] {
  return [...variant.modifierConditions, ...variant.pseudoConditions];
}

/**
 * Convert an inner condition tree into a single SelectorVariant with
 * one SelectorGroup whose branches represent the inner OR alternatives.
 * Shared by @root() and @own().
 *
 * Both positive and negated cases produce one variant with one group.
 * Negation simply sets the `negated` flag, which swaps :is() for :not()
 * in the final CSS output — no De Morgan transformation is needed.
 *
 * This mirrors parentConditionToVariants: OR branches are kept inside
 * a single group and rendered as comma-separated arguments in
 * :is()/:not(), e.g. :root:is([a], [b]) or [el]:not([a], [b]).
 */
function innerConditionToVariants(
  innerCondition: ConditionNode,
  negated: boolean,
  target: 'rootGroups' | 'ownGroups',
): CSSComponents {
  const innerCSS = conditionToCSS(innerCondition);

  if (innerCSS.isImpossible || innerCSS.variants.length === 0) {
    return { variants: [], isImpossible: true };
  }

  const branches: ParsedSelectorCondition[][] = [];

  for (const innerVariant of innerCSS.variants) {
    const conditions = collectSelectorConditions(innerVariant);

    if (conditions.length > 0) {
      branches.push(conditions);
    }
  }

  if (branches.length === 0) {
    return { variants: [emptyVariant()], isImpossible: false };
  }

  const v = emptyVariant();
  v[target].push({ branches, negated });

  return { variants: [v], isImpossible: false };
}

/**
 * Convert a @parent() inner condition into a single SelectorVariant with
 * one ParentGroup whose branches represent the inner OR alternatives.
 *
 * Both positive and negated cases produce one variant with one group.
 * Negation simply sets the `negated` flag, which swaps :is() for :not()
 * in the final CSS output — no structural transformation is needed.
 */
function parentConditionToVariants(
  innerCondition: ConditionNode,
  negated: boolean,
  direct: boolean,
): CSSComponents {
  const innerCSS = conditionToCSS(innerCondition);

  if (innerCSS.isImpossible || innerCSS.variants.length === 0) {
    return { variants: [], isImpossible: true };
  }

  const branches: ParsedSelectorCondition[][] = [];

  for (const innerVariant of innerCSS.variants) {
    const conditions = collectSelectorConditions(innerVariant);

    if (conditions.length > 0) {
      branches.push(conditions);
    }
  }

  if (branches.length === 0) {
    return { variants: [emptyVariant()], isImpossible: false };
  }

  const v = emptyVariant();
  v.parentGroups.push({ branches, direct, negated });

  return { variants: [v], isImpossible: false };
}

/**
 * Sort key for canonical condition output within selectors.
 *
 * Priority order:
 * 0: Boolean attribute selectors ([data-hovered])
 * 1: Value attribute selectors ([data-size="small"])
 * 2: Negated boolean attributes (:not([data-disabled]))
 * 3: Negated value attributes (:not([data-size="small"]))
 * 4: Pseudo-classes (:hover, :focus)
 * 5: Negated pseudo-classes (:not(:disabled))
 *
 * Secondary sort: alphabetical by attribute name / pseudo string.
 */
function conditionSortKey(cond: ParsedSelectorCondition): string {
  if ('attribute' in cond) {
    const hasValue = cond.value !== undefined ? 1 : 0;
    const neg = cond.negated ? 2 : 0;
    return `${neg + hasValue}|${cond.attribute}|${cond.value ?? ''}`;
  }
  const priority = cond.negated ? 5 : 4;
  return `${priority}|${cond.pseudo}`;
}

function sortConditions(
  conditions: ParsedSelectorCondition[],
): ParsedSelectorCondition[] {
  return conditions.toSorted((a, b) =>
    conditionSortKey(a).localeCompare(conditionSortKey(b)),
  );
}

export function branchToCSS(branch: ParsedSelectorCondition[]): string {
  let parts = '';
  for (const cond of sortConditions(branch)) {
    parts += selectorConditionToCSS(cond);
  }
  return parts;
}

/**
 * Wrap serialized selector arguments in :is() or :not().
 * Arguments are sorted for canonical output.
 */
function wrapInIsOrNot(args: string[], negated: boolean): string {
  const wrapper = negated ? ':not' : ':is';
  return `${wrapper}(${args.sort().join(', ')})`;
}

/**
 * Convert a selector group to a CSS selector fragment.
 *
 * Single-branch groups are unwrapped (no :is() wrapper).
 * Multi-branch groups use :is() or :not().
 * Negation swaps :is() for :not().
 */
export function selectorGroupToCSS(group: SelectorGroup): string {
  if (group.branches.length === 0) return '';

  // Single branch: emit directly without :is() wrapper
  if (group.branches.length === 1) {
    const parts = branchToCSS(group.branches[0]);
    if (group.negated) {
      return `:not(${parts})`;
    }
    return parts;
  }

  return wrapInIsOrNot(group.branches.map(branchToCSS), group.negated);
}

// ============================================================================
// Modifier Subsumption (shared by optimizeGroups and dedupeSelectorConditions)
// ============================================================================

interface SubsumptionFacts {
  negatedBooleanAttrs: Set<string>;
  positiveExactValuesByAttr: Map<string, Set<string>>;
}

/**
 * Collect facts about modifier conditions for subsumption analysis.
 * Tracks negated boolean attrs (:not([attr])) and positive exact values ([attr="X"]).
 */
function collectSubsumptionFacts(
  modifiers: Iterable<ParsedModifierCondition>,
): SubsumptionFacts {
  const negatedBooleanAttrs = new Set<string>();
  const positiveExactValuesByAttr = new Map<string, Set<string>>();

  for (const mod of modifiers) {
    if (mod.negated && mod.value === undefined) {
      negatedBooleanAttrs.add(mod.attribute);
    }
    if (
      !mod.negated &&
      mod.value !== undefined &&
      (mod.operator ?? '=') === '='
    ) {
      let vals = positiveExactValuesByAttr.get(mod.attribute);
      if (!vals) {
        vals = new Set();
        positiveExactValuesByAttr.set(mod.attribute, vals);
      }
      vals.add(mod.value);
    }
  }

  return { negatedBooleanAttrs, positiveExactValuesByAttr };
}

/**
 * Check if a negated-value modifier is subsumed by stronger facts:
 * - :not([attr]) subsumes :not([attr="val"])
 * - [attr="X"] implies :not([attr="Y"]) is redundant (single exact value)
 *
 * Only applies to exact-match (=) operators; substring operators don't
 * imply exclusivity between values.
 */
function isSubsumedNegatedModifier(
  mod: ParsedModifierCondition,
  facts: SubsumptionFacts,
): boolean {
  if (!mod.negated || mod.value === undefined) return false;

  if (facts.negatedBooleanAttrs.has(mod.attribute)) return true;

  if ((mod.operator ?? '=') === '=') {
    const posVals = facts.positiveExactValuesByAttr.get(mod.attribute);
    if (posVals && posVals.size === 1 && !posVals.has(mod.value)) {
      return true;
    }
  }

  return false;
}

/**
 * Remove redundant single-condition groups that are subsumed by stronger
 * groups on the same attribute. O(n) — only inspects single-branch,
 * single-condition groups.
 */
export function optimizeGroups(groups: SelectorGroup[]): SelectorGroup[] {
  if (groups.length <= 1) return groups;

  // Exact dedup by key
  const seen = new Set<string>();
  const result: SelectorGroup[] = [];
  for (const g of groups) {
    const key = getSelectorGroupKey(g);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(g);
    }
  }

  if (result.length <= 1) return result;

  // Extract modifier conditions from simple groups for subsumption analysis
  const effectiveModifiers: ParsedModifierCondition[] = [];
  for (const g of result) {
    if (g.branches.length !== 1 || g.branches[0].length !== 1) continue;
    const cond = g.branches[0][0];
    if (!('attribute' in cond)) continue;
    // Map group-level negation onto the condition for fact collection
    effectiveModifiers.push({
      ...cond,
      negated: g.negated !== cond.negated,
    });
  }

  const facts = collectSubsumptionFacts(effectiveModifiers);
  if (
    facts.negatedBooleanAttrs.size === 0 &&
    facts.positiveExactValuesByAttr.size === 0
  ) {
    return result;
  }

  return result.filter((g) => {
    if (g.branches.length !== 1 || g.branches[0].length !== 1) return true;
    const cond = g.branches[0][0];
    if (
      !('attribute' in cond) ||
      !g.negated ||
      cond.negated ||
      cond.value === undefined
    ) {
      return true;
    }
    return !isSubsumedNegatedModifier({ ...cond, negated: true }, facts);
  });
}

/**
 * Convert root groups to CSS selector prefix (for final output)
 */
export function rootGroupsToCSS(groups: SelectorGroup[]): string | undefined {
  if (groups.length === 0) return undefined;

  const optimized = optimizeGroups(groups);
  if (optimized.length === 0) return undefined;

  let prefix = ':root';
  for (const group of optimized) {
    prefix += selectorGroupToCSS(group);
  }
  return prefix;
}

/**
 * Convert parent groups to CSS selector fragments (for final output).
 * Each group produces its own :is()/:not() wrapper with a combinator
 * suffix (` *` or ` > *`) appended to each branch.
 */
export function parentGroupsToCSS(groups: ParentGroup[]): string {
  let result = '';
  for (const group of groups) {
    const combinator = group.direct ? ' > *' : ' *';
    const args = group.branches.map(
      (branch) => branchToCSS(branch) + combinator,
    );
    result += wrapInIsOrNot(args, group.negated);
  }
  return result;
}

/**
 * Convert a modifier or pseudo condition to a CSS selector fragment
 */
export function selectorConditionToCSS(cond: ParsedSelectorCondition): string {
  if ('attribute' in cond) {
    return modifierToCSS(cond);
  }
  return pseudoToCSS(cond);
}

/**
 * Get unique key for a modifier condition
 */
function getModifierKey(mod: ParsedModifierCondition): string {
  const base = mod.value
    ? `${mod.attribute}${mod.operator || '='}${mod.value}`
    : mod.attribute;
  return mod.negated ? `!${base}` : base;
}

/**
 * Get unique key for a pseudo condition
 */
function getPseudoKey(pseudo: ParsedPseudoCondition): string {
  return pseudo.negated ? `!${pseudo.pseudo}` : pseudo.pseudo;
}

/**
 * Get unique key for any selector condition (modifier or pseudo)
 */
function getSelectorConditionKey(cond: ParsedSelectorCondition): string {
  return 'attribute' in cond
    ? `mod:${getModifierKey(cond)}`
    : `pseudo:${getPseudoKey(cond)}`;
}

/**
 * Deduplicate selector conditions (modifiers or pseudos).
 * Shared by root, parent, and own conditions.
 */
function dedupeSelectorConditions(
  conditions: ParsedSelectorCondition[],
): ParsedSelectorCondition[] {
  // Pass 1: exact-key dedup
  const seen = new Set<string>();
  const result: ParsedSelectorCondition[] = [];
  for (const c of conditions) {
    const key = getSelectorConditionKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  // Pass 2: remove negated value modifiers subsumed by other modifiers
  const modifiers = result.filter(
    (c): c is ParsedModifierCondition => 'attribute' in c,
  );
  const facts = collectSubsumptionFacts(modifiers);
  if (
    facts.negatedBooleanAttrs.size === 0 &&
    facts.positiveExactValuesByAttr.size === 0
  ) {
    return result;
  }

  return result.filter((c) => {
    if (!('attribute' in c)) return true;
    return !isSubsumedNegatedModifier(c, facts);
  });
}

/**
 * Check for modifier contradiction: same attribute with opposite negation
 */
function hasModifierContradiction(
  conditions: ParsedModifierCondition[],
): boolean {
  const byKey = new Map<string, boolean>(); // base key -> isPositive

  for (const mod of conditions) {
    const baseKey = mod.value
      ? `${mod.attribute}${mod.operator || '='}${mod.value}`
      : mod.attribute;
    const existing = byKey.get(baseKey);
    if (existing !== undefined && existing !== !mod.negated) {
      return true; // Same attribute with opposite negation
    }
    byKey.set(baseKey, !mod.negated);
  }
  return false;
}

/**
 * Check for pseudo contradiction: same pseudo with opposite negation
 */
function hasPseudoContradiction(conditions: ParsedPseudoCondition[]): boolean {
  const byKey = new Map<string, boolean>(); // pseudo -> isPositive

  for (const pseudo of conditions) {
    const existing = byKey.get(pseudo.pseudo);
    if (existing !== undefined && existing !== !pseudo.negated) {
      return true; // Same pseudo with opposite negation
    }
    byKey.set(pseudo.pseudo, !pseudo.negated);
  }
  return false;
}

/**
 * Check for selector condition contradiction (modifier or pseudo with opposite negation).
 * Shared by root, parent, and own conditions.
 */
function hasSelectorConditionContradiction(
  conditions: ParsedSelectorCondition[],
): boolean {
  const modifiers: ParsedModifierCondition[] = [];
  const pseudos: ParsedPseudoCondition[] = [];

  for (const c of conditions) {
    if ('attribute' in c) {
      modifiers.push(c);
    } else {
      pseudos.push(c);
    }
  }

  return hasModifierContradiction(modifiers) || hasPseudoContradiction(pseudos);
}

/**
 * Check for parent group contradiction: same target (direct + conditions)
 * with opposite negation. E.g. :not([data-hovered] *) and :is([data-hovered] *)
 * in the same variant is impossible.
 */
function getBranchesKey(branches: ParsedSelectorCondition[][]): string {
  if (branches.length === 1) {
    const b = branches[0];
    if (b.length === 1) return getSelectorConditionKey(b[0]);
    return b.map(getSelectorConditionKey).sort().join('+');
  }
  return branches
    .map((b) => b.map(getSelectorConditionKey).sort().join('+'))
    .sort()
    .join(',');
}

function hasParentGroupContradiction(groups: ParentGroup[]): boolean {
  const byBaseKey = new Map<string, boolean>();

  for (const g of groups) {
    const baseKey = `${g.direct ? '>' : ''}(${getBranchesKey(g.branches)})`;
    const existing = byBaseKey.get(baseKey);
    if (existing !== undefined && existing !== !g.negated) {
      return true;
    }
    byBaseKey.set(baseKey, !g.negated);
  }
  return false;
}

/**
 * Check for selector group contradiction: same branches with opposite negation.
 * E.g. :is([data-a]) and :not([data-a]) in the same variant is impossible.
 */
function hasSelectorGroupContradiction(groups: SelectorGroup[]): boolean {
  const byBaseKey = new Map<string, boolean>();

  for (const g of groups) {
    const baseKey = getBranchesKey(g.branches);
    const existing = byBaseKey.get(baseKey);
    if (existing !== undefined && existing !== !g.negated) {
      return true;
    }
    byBaseKey.set(baseKey, !g.negated);
  }
  return false;
}

/**
 * Merge two selector variants (AND operation)
 * Deduplicates conditions and checks for contradictions
 */
function mergeVariants(
  a: SelectorVariant,
  b: SelectorVariant,
): SelectorVariant | null {
  // Merge media conditions and check for contradictions
  const mergedMedia = dedupeMediaConditions([
    ...a.mediaConditions,
    ...b.mediaConditions,
  ]);
  if (hasMediaContradiction(mergedMedia)) {
    return null; // Impossible variant
  }

  // Concatenate root groups, optimize, and check for contradictions
  const mergedRootGroups = optimizeGroups([...a.rootGroups, ...b.rootGroups]);
  if (hasSelectorGroupContradiction(mergedRootGroups)) {
    return null; // Impossible variant
  }

  // Merge modifier and pseudo conditions separately, then cross-check
  const mergedModifiers = dedupeSelectorConditions([
    ...a.modifierConditions,
    ...b.modifierConditions,
  ]) as ParsedModifierCondition[];
  const mergedPseudos = dedupeSelectorConditions([
    ...a.pseudoConditions,
    ...b.pseudoConditions,
  ]) as ParsedPseudoCondition[];
  if (
    hasSelectorConditionContradiction([...mergedModifiers, ...mergedPseudos])
  ) {
    return null; // Impossible variant
  }

  // Concatenate selector groups, optimize, and check for contradictions
  const mergedSelectorGroups = optimizeGroups([
    ...a.selectorGroups,
    ...b.selectorGroups,
  ]);
  if (hasSelectorGroupContradiction(mergedSelectorGroups)) {
    return null; // Impossible variant
  }

  // Concatenate parent groups (each group is an independent :is() wrapper)
  const mergedParentGroups = [...a.parentGroups, ...b.parentGroups];
  if (hasParentGroupContradiction(mergedParentGroups)) {
    return null; // Impossible variant
  }

  // Concatenate own groups, optimize, and check for contradictions
  const mergedOwnGroups = optimizeGroups([...a.ownGroups, ...b.ownGroups]);
  if (hasSelectorGroupContradiction(mergedOwnGroups)) {
    return null; // Impossible variant
  }

  // Merge container conditions and check for contradictions
  const mergedContainers = dedupeContainerConditions([
    ...a.containerConditions,
    ...b.containerConditions,
  ]);
  if (hasContainerStyleContradiction(mergedContainers)) {
    return null; // Impossible variant
  }

  // Merge supports conditions and check for contradictions
  const mergedSupports = dedupeSupportsConditions([
    ...a.supportsConditions,
    ...b.supportsConditions,
  ]);
  if (hasSupportsContradiction(mergedSupports)) {
    return null; // Impossible variant
  }

  return {
    modifierConditions: mergedModifiers,
    pseudoConditions: mergedPseudos,
    selectorGroups: mergedSelectorGroups,
    ownGroups: mergedOwnGroups,
    mediaConditions: mergedMedia,
    containerConditions: mergedContainers,
    supportsConditions: mergedSupports,
    rootGroups: mergedRootGroups,
    parentGroups: mergedParentGroups,
    startingStyle: a.startingStyle || b.startingStyle,
  };
}

/**
 * Generic deduplication by a key extraction function.
 * Preserves insertion order, keeping the first occurrence of each key.
 */
function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function dedupeMediaConditions(
  conditions: ParsedMediaCondition[],
): ParsedMediaCondition[] {
  return dedupeByKey(
    conditions,
    (c) => `${c.subtype}|${c.condition}|${c.negated}`,
  );
}

function dedupeContainerConditions(
  conditions: ParsedContainerCondition[],
): ParsedContainerCondition[] {
  return dedupeByKey(
    conditions,
    (c) => `${c.name ?? ''}|${c.condition}|${c.negated}`,
  );
}

function dedupeSupportsConditions(
  conditions: ParsedSupportsCondition[],
): ParsedSupportsCondition[] {
  return dedupeByKey(
    conditions,
    (c) => `${c.subtype}|${c.condition}|${c.negated}`,
  );
}

/**
 * Check if supports conditions contain contradictions
 * e.g., @supports(display: grid) AND NOT @supports(display: grid)
 */
function hasSupportsContradiction(
  conditions: ParsedSupportsCondition[],
): boolean {
  const conditionMap = new Map<string, boolean>(); // key -> isPositive

  for (const cond of conditions) {
    const key = `${cond.subtype}|${cond.condition}`;
    const existing = conditionMap.get(key);
    if (existing !== undefined && existing !== !cond.negated) {
      return true; // Contradiction: positive AND negated
    }
    conditionMap.set(key, !cond.negated);
  }

  return false;
}

/**
 * Check if a set of media conditions contains contradictions
 * e.g., (prefers-color-scheme: light) AND NOT (prefers-color-scheme: light)
 * or (width >= 900px) AND (width < 600px)
 *
 * Uses parsed media conditions for efficient analysis without regex parsing.
 */
function hasMediaContradiction(conditions: ParsedMediaCondition[]): boolean {
  // Track conditions by their key (condition string) to detect A and NOT A
  const featureConditions = new Map<string, boolean>(); // key -> isPositive
  const typeConditions = new Map<string, boolean>(); // mediaType -> isPositive
  const dimensionConditions = new Map<string, boolean>(); // condition -> isPositive

  // Track dimension conditions for range contradiction detection (non-negated only)
  const dimensionsByDim = new Map<
    string,
    { lowerBound: number | null; upperBound: number | null }
  >();

  for (const cond of conditions) {
    if (cond.subtype === 'type') {
      // Type query: check for direct contradiction (print AND NOT print)
      const key = cond.mediaType || 'all';
      const existing = typeConditions.get(key);
      if (existing !== undefined && existing !== !cond.negated) {
        return true; // Contradiction: positive AND negated
      }
      typeConditions.set(key, !cond.negated);
    } else if (cond.subtype === 'feature') {
      // Feature query: check for direct contradiction
      const key = cond.condition;
      const existing = featureConditions.get(key);
      if (existing !== undefined && existing !== !cond.negated) {
        return true; // Contradiction: positive AND negated
      }
      featureConditions.set(key, !cond.negated);
    } else if (cond.subtype === 'dimension') {
      // First, check for direct contradiction: (width < 600px) AND NOT (width < 600px)
      const condKey = cond.condition;
      const existing = dimensionConditions.get(condKey);
      if (existing !== undefined && existing !== !cond.negated) {
        return true; // Contradiction: positive AND negated
      }
      dimensionConditions.set(condKey, !cond.negated);

      // For range analysis, only consider non-negated conditions
      // Negated conditions are handled via the direct contradiction check above
      if (!cond.negated) {
        const dim = cond.dimension || 'width';
        let bounds = dimensionsByDim.get(dim);
        if (!bounds) {
          bounds = { lowerBound: null, upperBound: null };
          dimensionsByDim.set(dim, bounds);
        }

        // Track the effective bounds
        if (cond.lowerBound?.valueNumeric != null) {
          const value = cond.lowerBound.valueNumeric;
          if (bounds.lowerBound === null || value > bounds.lowerBound) {
            bounds.lowerBound = value;
          }
        }
        if (cond.upperBound?.valueNumeric != null) {
          const value = cond.upperBound.valueNumeric;
          if (bounds.upperBound === null || value < bounds.upperBound) {
            bounds.upperBound = value;
          }
        }

        // Check for impossible range
        if (
          bounds.lowerBound !== null &&
          bounds.upperBound !== null &&
          bounds.lowerBound >= bounds.upperBound
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if container conditions contain contradictions in style queries
 * e.g., style(--variant: danger) and style(--variant: success) together
 * Same property with different values = always false
 *
 * Uses parsed container conditions for efficient analysis without regex parsing.
 */
function hasContainerStyleContradiction(
  conditions: ParsedContainerCondition[],
): boolean {
  // Track style queries by property name
  // key: property name, value: { hasExistence: boolean, values: Set<string>, hasNegatedExistence: boolean }
  const styleQueries = new Map<
    string,
    { hasExistence: boolean; values: Set<string>; hasNegatedExistence: boolean }
  >();

  for (const cond of conditions) {
    // Only analyze style queries
    if (cond.subtype !== 'style' || !cond.property) {
      continue;
    }

    const property = cond.property;
    const value = cond.propertyValue;

    if (!styleQueries.has(property)) {
      styleQueries.set(property, {
        hasExistence: false,
        values: new Set(),
        hasNegatedExistence: false,
      });
    }

    const entry = styleQueries.get(property)!;

    if (cond.negated) {
      if (value === undefined) {
        // not style(--prop) - negated existence check
        entry.hasNegatedExistence = true;
      }
      // Negated value checks don't contradict positive value checks directly
      // They just mean "not this value"
    } else {
      if (value === undefined) {
        // style(--prop) - existence check
        entry.hasExistence = true;
      } else {
        // style(--prop: value) - value check
        entry.values.add(value);
      }
    }
  }

  // Check for contradictions
  for (const [, entry] of styleQueries) {
    // Contradiction: existence check + negated existence check
    if (entry.hasExistence && entry.hasNegatedExistence) {
      return true;
    }

    // Contradiction: multiple different values for same property
    // style(--variant: danger) AND style(--variant: success) is impossible
    if (entry.values.size > 1) {
      return true;
    }

    // Contradiction: negated existence + value check
    // not style(--variant) AND style(--variant: danger) is impossible
    if (entry.hasNegatedExistence && entry.values.size > 0) {
      return true;
    }
  }

  return false;
}

const variantKeyCache = new WeakMap<SelectorVariant, string>();

/**
 * Get a unique key for a variant (for deduplication).
 * Cached via WeakMap since variants are compared multiple times during
 * deduplication and sorting.
 */
function getSelectorGroupKey(g: SelectorGroup): string {
  return `${g.negated ? '!' : ''}(${getBranchesKey(g.branches)})`;
}

/**
 * Get a context key for a variant — everything except flat modifier/pseudo
 * conditions. Variants with the same context key can be merged into an
 * :is() group. Also used by getVariantKey as the shared non-selector portion.
 */
function getVariantContextKey(v: SelectorVariant): string {
  const mediaKey = v.mediaConditions
    .map((c) => `${c.subtype}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const containerKey = v.containerConditions
    .map((c) => `${c.name ?? ''}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const supportsKey = v.supportsConditions
    .map((c) => `${c.subtype}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const rootKey = v.rootGroups.map(getSelectorGroupKey).sort().join('|');
  const parentKey = v.parentGroups.map(getParentGroupKey).sort().join('|');
  const ownKey = v.ownGroups.map(getSelectorGroupKey).sort().join('|');
  const selectorGroupKey = v.selectorGroups
    .map(getSelectorGroupKey)
    .sort()
    .join('|');

  return [
    mediaKey,
    containerKey,
    supportsKey,
    rootKey,
    parentKey,
    ownKey,
    selectorGroupKey,
    v.startingStyle ? '1' : '0',
  ].join('###');
}

function getVariantKey(v: SelectorVariant): string {
  const cached = variantKeyCache.get(v);
  if (cached !== undefined) return cached;
  const modifierKey = v.modifierConditions.map(getModifierKey).sort().join('|');
  const pseudoKey = v.pseudoConditions.map(getPseudoKey).sort().join('|');
  const key = modifierKey + '###' + pseudoKey + '###' + getVariantContextKey(v);
  variantKeyCache.set(v, key);
  return key;
}

/**
 * Total number of leaf conditions in a variant (for superset / dedup comparisons).
 */
function groupConditionCount(
  groups: readonly { branches: ParsedSelectorCondition[][] }[],
): number {
  return groups.reduce(
    (sum, g) => sum + g.branches.reduce((s, b) => s + b.length, 0),
    0,
  );
}

function variantConditionCount(v: SelectorVariant): number {
  return (
    v.modifierConditions.length +
    v.pseudoConditions.length +
    groupConditionCount(v.selectorGroups) +
    groupConditionCount(v.ownGroups) +
    v.mediaConditions.length +
    v.containerConditions.length +
    v.supportsConditions.length +
    groupConditionCount(v.rootGroups) +
    groupConditionCount(v.parentGroups)
  );
}

/**
 * Check if variant A is a superset of variant B (A is more restrictive)
 *
 * If A has all of B's conditions plus more, then A is redundant
 * because B already covers the same cases (and more).
 *
 * Example:
 *   A: :not([size=large]):not([size=medium]):not([size=small])
 *   B: :not([size=large])
 *   A is a superset of B, so A is redundant when B exists.
 */
function isVariantSuperset(a: SelectorVariant, b: SelectorVariant): boolean {
  // Must have same context
  if (a.startingStyle !== b.startingStyle) return false;

  // Check if a.rootGroups is superset of b.rootGroups
  if (!isSelectorGroupsSuperset(a.rootGroups, b.rootGroups)) return false;

  // Check if a.mediaConditions is superset of b.mediaConditions
  if (!isMediaConditionsSuperset(a.mediaConditions, b.mediaConditions))
    return false;

  // Check if a.containerConditions is superset of b.containerConditions
  if (
    !isContainerConditionsSuperset(a.containerConditions, b.containerConditions)
  )
    return false;

  // Check if a.supportsConditions is superset of b.supportsConditions
  if (!isSupportsConditionsSuperset(a.supportsConditions, b.supportsConditions))
    return false;

  // Check if a.modifierConditions is superset of b.modifierConditions
  if (!isModifierConditionsSuperset(a.modifierConditions, b.modifierConditions))
    return false;

  // Check if a.pseudoConditions is superset of b.pseudoConditions
  if (!isPseudoConditionsSuperset(a.pseudoConditions, b.pseudoConditions))
    return false;

  // Check if a.selectorGroups is superset of b.selectorGroups
  if (!isSelectorGroupsSuperset(a.selectorGroups, b.selectorGroups))
    return false;

  // Check if a.ownGroups is superset of b.ownGroups
  if (!isSelectorGroupsSuperset(a.ownGroups, b.ownGroups)) return false;

  // Check if a.parentGroups is superset of b.parentGroups
  if (!isParentGroupsSuperset(a.parentGroups, b.parentGroups)) return false;

  return variantConditionCount(a) > variantConditionCount(b);
}

/**
 * Generic superset check: true if every item in B has a matching key in A.
 */
function isConditionsSuperset<T>(
  a: T[],
  b: T[],
  getKey: (item: T) => string,
): boolean {
  const aKeys = new Set(a.map(getKey));
  return b.every((c) => aKeys.has(getKey(c)));
}

function isMediaConditionsSuperset(
  a: ParsedMediaCondition[],
  b: ParsedMediaCondition[],
): boolean {
  return isConditionsSuperset(
    a,
    b,
    (c) => `${c.subtype}|${c.condition}|${c.negated}`,
  );
}

function isContainerConditionsSuperset(
  a: ParsedContainerCondition[],
  b: ParsedContainerCondition[],
): boolean {
  return isConditionsSuperset(
    a,
    b,
    (c) => `${c.name ?? ''}|${c.condition}|${c.negated}`,
  );
}

function isSupportsConditionsSuperset(
  a: ParsedSupportsCondition[],
  b: ParsedSupportsCondition[],
): boolean {
  return isConditionsSuperset(
    a,
    b,
    (c) => `${c.subtype}|${c.condition}|${c.negated}`,
  );
}

function isModifierConditionsSuperset(
  a: ParsedModifierCondition[],
  b: ParsedModifierCondition[],
): boolean {
  return isConditionsSuperset(a, b, getModifierKey);
}

function isPseudoConditionsSuperset(
  a: ParsedPseudoCondition[],
  b: ParsedPseudoCondition[],
): boolean {
  return isConditionsSuperset(a, b, getPseudoKey);
}

function isSelectorGroupsSuperset(
  a: SelectorGroup[],
  b: SelectorGroup[],
): boolean {
  if (a.length < b.length) return false;
  return isConditionsSuperset(a, b, getSelectorGroupKey);
}

/**
 * Check if parent groups A is a superset of B.
 * Each group in B must have a matching group in A.
 */
function isParentGroupsSuperset(a: ParentGroup[], b: ParentGroup[]): boolean {
  if (a.length < b.length) return false;
  return isConditionsSuperset(a, b, getParentGroupKey);
}

function getParentGroupKey(g: ParentGroup): string {
  return `${g.negated ? '!' : ''}${g.direct ? '>' : ''}(${getBranchesKey(g.branches)})`;
}

/**
 * Deduplicate variants
 *
 * Removes:
 * 1. Exact duplicates (same key)
 * 2. Superset variants (more restrictive selectors that are redundant)
 */
function dedupeVariants(variants: SelectorVariant[]): SelectorVariant[] {
  if (variants.length <= 1) return variants;

  // First pass: exact deduplication
  const seen = new Set<string>();
  const result: SelectorVariant[] = [];

  for (const v of variants) {
    const key = getVariantKey(v);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(v);
    }
  }

  if (result.length <= 1) return result;

  // Second pass: remove supersets (more restrictive variants)
  // Sort by total condition count (fewer conditions = less restrictive = keep)
  result.sort((a, b) => variantConditionCount(a) - variantConditionCount(b));

  // Remove variants that are supersets of earlier (less restrictive) variants
  const filtered: SelectorVariant[] = [];
  for (const candidate of result) {
    let isRedundant = false;
    for (const kept of filtered) {
      if (isVariantSuperset(candidate, kept)) {
        isRedundant = true;
        break;
      }
    }
    if (!isRedundant) {
      filtered.push(candidate);
    }
  }

  return filtered;
}

/**
 * Combine AND conditions into CSS
 *
 * AND of conditions means cartesian product of variants:
 * (A1 | A2) & (B1 | B2) = A1&B1 | A1&B2 | A2&B1 | A2&B2
 *
 * Variants that result in contradictions (e.g., conflicting media rules)
 * are filtered out.
 */
function andToCSS(children: ConditionNode[]): CSSComponents {
  // Start with a single empty variant
  let currentVariants: SelectorVariant[] = [emptyVariant()];

  for (const child of children) {
    const childCSS = conditionToCSSInner(child);

    if (childCSS.isImpossible || childCSS.variants.length === 0) {
      return { variants: [], isImpossible: true };
    }

    // Cartesian product: each current variant × each child variant
    const newVariants: SelectorVariant[] = [];
    for (const current of currentVariants) {
      for (const childVariant of childCSS.variants) {
        const merged = mergeVariants(current, childVariant);
        // Skip impossible variants (contradictions detected during merge)
        if (merged !== null) {
          newVariants.push(merged);
        }
      }
    }

    if (newVariants.length === 0) {
      return { variants: [], isImpossible: true };
    }

    // Deduplicate after each step to prevent exponential blowup
    currentVariants = dedupeVariants(newVariants);
  }

  return {
    variants: currentVariants,
    isImpossible: false,
  };
}

/**
 * Combine OR conditions into CSS
 *
 * OR in CSS means multiple selector variants (DNF).
 * After deduplication, variants that differ only in their base
 * modifier/pseudo conditions are merged into :is() groups.
 *
 * OR branches are collected as independent variants. Variants that share
 * the same context are later merged into :is() groups by
 * mergeVariantsIntoSelectorGroups.
 */
function orToCSS(children: ConditionNode[]): CSSComponents {
  const allVariants: SelectorVariant[] = [];

  for (const child of children) {
    const childCSS = conditionToCSSInner(child);
    if (childCSS.isImpossible) continue;

    allVariants.push(...childCSS.variants);
  }

  if (allVariants.length === 0) {
    return { variants: [], isImpossible: true };
  }

  return {
    variants: dedupeVariants(allVariants),
    isImpossible: false,
  };
}

// ============================================================================
// OR → :is() Merging
// ============================================================================

/**
 * Find keys present in ALL condition arrays.
 */
function findCommonKeys<T>(
  conditionSets: T[][],
  getKey: (item: T) => string,
): Set<string> {
  if (conditionSets.length === 0) return new Set();

  const common = new Set(conditionSets[0].map(getKey));
  for (let i = 1; i < conditionSets.length; i++) {
    const keys = new Set(conditionSets[i].map(getKey));
    for (const key of common) {
      if (!keys.has(key)) common.delete(key);
    }
  }
  return common;
}

/**
 * Merge OR variants that share the same "context" (at-rules, root, parent,
 * own, starting) into a single variant with a SelectorGroup.
 *
 * Variants with no modifier/pseudo conditions are kept separate (they match
 * unconditionally and can't be expressed inside :is()).
 */
export function mergeVariantsIntoSelectorGroups(
  variants: SelectorVariant[],
): SelectorVariant[] {
  if (variants.length <= 1) return variants;

  // Group variants by their context (everything except flat modifier/pseudo)
  const groups = new Map<string, SelectorVariant[]>();
  for (const v of variants) {
    const key = getVariantContextKey(v);
    const group = groups.get(key);
    if (group) group.push(v);
    else groups.set(key, [v]);
  }

  const result: SelectorVariant[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Separate variants with no selector conditions (can't merge into :is())
    const withSelectors: SelectorVariant[] = [];
    const withoutSelectors: SelectorVariant[] = [];
    for (const v of group) {
      if (
        v.modifierConditions.length === 0 &&
        v.pseudoConditions.length === 0
      ) {
        withoutSelectors.push(v);
      } else {
        withSelectors.push(v);
      }
    }

    result.push(...withoutSelectors);

    if (withSelectors.length <= 1) {
      result.push(...withSelectors);
      continue;
    }

    // Factor out common conditions and create a SelectorGroup
    result.push(factorAndGroup(withSelectors));
  }

  return result;
}

/**
 * Factor common modifier/pseudo conditions out of variants and create
 * a single variant with a SelectorGroup for the remaining (differing)
 * conditions.
 *
 * Precondition: all variants must share the same context key (identical
 * at-rules, root/parent/own/selector groups, startingStyle).
 */
function factorAndGroup(variants: SelectorVariant[]): SelectorVariant {
  if (process.env.NODE_ENV !== 'production') {
    const key0 = getVariantContextKey(variants[0]);
    for (let i = 1; i < variants.length; i++) {
      const keyI = getVariantContextKey(variants[i]);
      if (keyI !== key0) {
        throw new Error(
          `factorAndGroup: context key mismatch at index ${i}.\n` +
            `  expected: ${key0}\n  got:      ${keyI}`,
        );
      }
    }
  }

  // Find common modifier and pseudo keys across ALL variants
  const commonModKeys = findCommonKeys(
    variants.map((v) => v.modifierConditions),
    getModifierKey,
  );
  const commonPseudoKeys = findCommonKeys(
    variants.map((v) => v.pseudoConditions),
    getPseudoKey,
  );

  // Extract common conditions from first variant
  const commonModifiers = variants[0].modifierConditions.filter((m) =>
    commonModKeys.has(getModifierKey(m)),
  );
  const commonPseudos = variants[0].pseudoConditions.filter((p) =>
    commonPseudoKeys.has(getPseudoKey(p)),
  );

  // Build branches from remaining (non-common) conditions.
  // If any variant has only common conditions (empty branch), it matches
  // unconditionally within this context — the :is() group would lose it.
  // In that case, return the broadest variant (common conditions only).
  const branches: ParsedSelectorCondition[][] = [];
  let hasEmptyBranch = false;
  for (const v of variants) {
    const branch: ParsedSelectorCondition[] = [];
    for (const mod of v.modifierConditions) {
      if (!commonModKeys.has(getModifierKey(mod))) branch.push(mod);
    }
    for (const pseudo of v.pseudoConditions) {
      if (!commonPseudoKeys.has(getPseudoKey(pseudo))) branch.push(pseudo);
    }
    if (branch.length > 0) {
      branches.push(branch);
    } else {
      hasEmptyBranch = true;
    }
  }

  // If a variant has only common conditions, it's the broadest match —
  // the :is() group with specific branches is subsumed by it.
  // Return the variant with common conditions only.
  if (hasEmptyBranch) {
    return {
      ...variants[0],
      modifierConditions: commonModifiers,
      pseudoConditions: commonPseudos,
    };
  }

  return {
    modifierConditions: commonModifiers,
    pseudoConditions: commonPseudos,
    selectorGroups: [
      ...variants[0].selectorGroups,
      { branches, negated: false },
    ],
    ownGroups: [...variants[0].ownGroups],
    mediaConditions: [...variants[0].mediaConditions],
    containerConditions: [...variants[0].containerConditions],
    supportsConditions: [...variants[0].supportsConditions],
    rootGroups: [...variants[0].rootGroups],
    parentGroups: [...variants[0].parentGroups],
    startingStyle: variants[0].startingStyle,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build at-rules array from a variant
 */
export function buildAtRulesFromVariant(variant: SelectorVariant): string[] {
  const atRules: string[] = [];

  // Add media rules - combine all conditions with "and"
  if (variant.mediaConditions.length > 0) {
    const conditionParts = variant.mediaConditions.map((c) => {
      if (c.subtype === 'type') {
        // Media type: print, screen, etc.
        return c.negated ? `not ${c.condition}` : c.condition;
      } else {
        // Feature or dimension: use not (condition) syntax for negation
        // MQ Level 4 requires parentheses around the condition for negation
        return c.negated ? `(not ${c.condition})` : c.condition;
      }
    });
    atRules.push(`@media ${conditionParts.join(' and ')}`);
  }

  // Add container rules - group by container name and combine with "and"
  if (variant.containerConditions.length > 0) {
    // Group conditions by container name (undefined = unnamed/nearest)
    const byName = new Map<string | undefined, ParsedContainerCondition[]>();
    for (const cond of variant.containerConditions) {
      const group = byName.get(cond.name) || [];
      group.push(cond);
      byName.set(cond.name, group);
    }

    // Build one @container rule per container name
    for (const [name, conditions] of byName) {
      // CSS Container Query syntax requires parentheses around negated conditions:
      // @container (not style(--x)) and style(--y) - NOT @container not style(--x) and style(--y)
      const conditionParts = conditions.map((c) =>
        c.negated ? `(not ${c.condition})` : c.condition,
      );
      const namePrefix = name ? `${name} ` : '';
      atRules.push(`@container ${namePrefix}${conditionParts.join(' and ')}`);
    }
  }

  // Add supports rules - combine all conditions with "and"
  if (variant.supportsConditions.length > 0) {
    const conditionParts = variant.supportsConditions.map((c) => {
      // Build the condition based on subtype
      // feature: (display: grid) or (not (display: grid))
      // selector: selector(:has(*)) or (not selector(:has(*)))
      if (c.subtype === 'selector') {
        const selectorCond = `selector(${c.condition})`;
        return c.negated ? `(not ${selectorCond})` : selectorCond;
      } else {
        const featureCond = `(${c.condition})`;
        return c.negated ? `(not ${featureCond})` : featureCond;
      }
    });
    atRules.push(`@supports ${conditionParts.join(' and ')}`);
  }

  // Add starting-style
  if (variant.startingStyle) {
    atRules.push('@starting-style');
  }

  return atRules;
}
