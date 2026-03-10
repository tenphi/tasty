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
import { getConditionUniqueId, not } from './conditions';

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
 * A group of parent conditions originating from a single @parent() call.
 * Each group produces its own :is()/:not() wrapper in the final CSS.
 * Separate @parent() calls = separate groups = can match different ancestors.
 *
 * Each branch is an AND conjunction of conditions (one selector fragment).
 * Multiple branches are OR'd together inside the :is()/:not() wrapper.
 * Example: @parent(hovered & pressed | active)
 *   branches: [[hovered, pressed], [active]]
 *   renders:  :is([data-hovered][data-pressed] *, [data-active] *)
 */
export interface ParentGroup {
  branches: ParsedSelectorCondition[][];
  direct: boolean;
  negated: boolean;
}

/**
 * A single selector variant (one term in a DNF expression)
 */
export interface SelectorVariant {
  /** Structured modifier conditions */
  modifierConditions: ParsedModifierCondition[];

  /** Structured pseudo conditions */
  pseudoConditions: ParsedPseudoCondition[];

  /** Structured own conditions (for sub-element states) */
  ownConditions: ParsedSelectorCondition[];

  /** Parsed media conditions for structured combination */
  mediaConditions: ParsedMediaCondition[];

  /** Parsed container conditions for structured combination */
  containerConditions: ParsedContainerCondition[];

  /** Parsed supports conditions for @supports at-rules */
  supportsConditions: ParsedSupportsCondition[];

  /** Root conditions (modifier/pseudo applied to :root) */
  rootConditions: ParsedSelectorCondition[];

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
    ownConditions: [],
    mediaConditions: [],
    containerConditions: [],
    supportsConditions: [],
    rootConditions: [],
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
        'rootConditions',
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
        'ownConditions',
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
 * Convert an inner condition tree into SelectorVariants.
 * Each inner OR branch becomes a separate variant, preserving disjunction.
 * Shared by @root() and @own().
 */
function innerConditionToVariants(
  innerCondition: ConditionNode,
  negated: boolean,
  target: 'rootConditions' | 'ownConditions',
): CSSComponents {
  // For @root/@own, negation is applied upfront via De Morgan: !(A | B) = !A & !B.
  // This is safe because the negated conditions are appended directly to the same
  // selector (e.g. :root:not([a]):not([b])), so collapsing OR branches is correct.
  //
  // @parent uses a different strategy (parentConditionToVariants) because
  // conditions are scoped to ancestors via the * combinator. OR branches are
  // kept inside a single ParentGroup and rendered as comma-separated arguments
  // in :is()/:not(), e.g. :is([a] *, [b] *). Negation just swaps :is for :not.
  const effectiveCondition = negated ? not(innerCondition) : innerCondition;
  const innerCSS = conditionToCSS(effectiveCondition);

  if (innerCSS.isImpossible || innerCSS.variants.length === 0) {
    return { variants: [], isImpossible: true };
  }

  const variants: SelectorVariant[] = [];

  for (const innerVariant of innerCSS.variants) {
    const conditions = collectSelectorConditions(innerVariant);

    if (conditions.length > 0) {
      const v = emptyVariant();
      v[target].push(...conditions);
      variants.push(v);
    }
  }

  if (variants.length === 0) {
    return { variants: [emptyVariant()], isImpossible: false };
  }

  return { variants, isImpossible: false };
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
 * Convert parsed root conditions to CSS selector prefix (for final output)
 */
export function rootConditionsToCSS(
  roots: ParsedSelectorCondition[],
): string | undefined {
  if (roots.length === 0) return undefined;

  let prefix = ':root';
  for (const cond of roots) {
    prefix += selectorConditionToCSS(cond);
  }
  return prefix;
}

/**
 * Convert parent groups to CSS selector fragments (for final output).
 * Each group produces its own :is() wrapper.
 */
export function parentGroupsToCSS(groups: ParentGroup[]): string {
  let result = '';
  for (const group of groups) {
    const combinator = group.direct ? ' > *' : ' *';
    const selectorArgs = group.branches.map((branch) => {
      let parts = '';
      for (const cond of branch) {
        parts += selectorConditionToCSS(cond);
      }
      return parts + combinator;
    });
    const wrapper = group.negated ? ':not' : ':is';
    result += `${wrapper}(${selectorArgs.join(', ')})`;
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
  let result: ParsedSelectorCondition[] = [];
  for (const c of conditions) {
    const key = getSelectorConditionKey(c);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }

  // Pass 2: remove negated value modifiers subsumed by other modifiers.
  // :not([data-attr]) subsumes :not([data-attr="value"])
  // [data-attr="X"] implies :not([data-attr="Y"]) is redundant
  // This implication only holds for exact-match (=) operators; substring
  // operators (^=, $=, *=) don't imply exclusivity between values.
  const negatedBooleanAttrs = new Set<string>();
  const positiveExactValuesByAttr = new Map<string, Set<string>>();

  for (const c of result) {
    if (!('attribute' in c)) continue;
    if (c.negated && c.value === undefined) {
      negatedBooleanAttrs.add(c.attribute);
    }
    const op = c.operator ?? '=';
    if (!c.negated && c.value !== undefined && op === '=') {
      let values = positiveExactValuesByAttr.get(c.attribute);
      if (!values) {
        values = new Set();
        positiveExactValuesByAttr.set(c.attribute, values);
      }
      values.add(c.value);
    }
  }

  result = result.filter((c) => {
    if (!('attribute' in c) || !c.negated || c.value === undefined) {
      return true;
    }
    if (negatedBooleanAttrs.has(c.attribute)) {
      return false;
    }
    const op = c.operator ?? '=';
    if (op !== '=') return true;
    const positiveValues = positiveExactValuesByAttr.get(c.attribute);
    if (
      positiveValues !== undefined &&
      positiveValues.size === 1 &&
      !positiveValues.has(c.value)
    ) {
      return false;
    }
    return true;
  });

  return result;
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

  // Merge root conditions and check for contradictions
  const mergedRoots = dedupeSelectorConditions([
    ...a.rootConditions,
    ...b.rootConditions,
  ]);
  if (hasSelectorConditionContradiction(mergedRoots)) {
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

  // Concatenate parent groups (each group is an independent :is() wrapper)
  const mergedParentGroups = [...a.parentGroups, ...b.parentGroups];
  if (hasParentGroupContradiction(mergedParentGroups)) {
    return null; // Impossible variant
  }

  // Merge own conditions and check for contradictions
  const mergedOwn = dedupeSelectorConditions([
    ...a.ownConditions,
    ...b.ownConditions,
  ]);
  if (hasSelectorConditionContradiction(mergedOwn)) {
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
    ownConditions: mergedOwn,
    mediaConditions: mergedMedia,
    containerConditions: mergedContainers,
    supportsConditions: mergedSupports,
    rootConditions: mergedRoots,
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
function getVariantKey(v: SelectorVariant): string {
  const cached = variantKeyCache.get(v);
  if (cached !== undefined) return cached;
  const modifierKey = v.modifierConditions.map(getModifierKey).sort().join('|');
  const pseudoKey = v.pseudoConditions.map(getPseudoKey).sort().join('|');
  const ownKey = v.ownConditions.map(getSelectorConditionKey).sort().join('|');
  const containerKey = v.containerConditions
    .map((c) => `${c.name ?? ''}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const mediaKey = v.mediaConditions
    .map((c) => `${c.subtype}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const supportsKey = v.supportsConditions
    .map((c) => `${c.subtype}:${c.negated ? '!' : ''}${c.condition}`)
    .sort()
    .join('|');
  const rootKey = v.rootConditions
    .map(getSelectorConditionKey)
    .sort()
    .join('|');
  const parentKey = v.parentGroups.map(getParentGroupKey).sort().join('|');
  const key = [
    modifierKey,
    pseudoKey,
    ownKey,
    mediaKey,
    containerKey,
    supportsKey,
    rootKey,
    parentKey,
    v.startingStyle ? '1' : '0',
  ].join('###');
  variantKeyCache.set(v, key);
  return key;
}

/**
 * Total number of leaf conditions in a variant (for superset / dedup comparisons).
 */
function variantConditionCount(v: SelectorVariant): number {
  return (
    v.modifierConditions.length +
    v.pseudoConditions.length +
    v.ownConditions.length +
    v.mediaConditions.length +
    v.containerConditions.length +
    v.supportsConditions.length +
    v.rootConditions.length +
    v.parentGroups.reduce(
      (sum, g) => sum + g.branches.reduce((s, b) => s + b.length, 0),
      0,
    )
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

  // Check if a.rootConditions is superset of b.rootConditions
  if (!isSelectorConditionsSuperset(a.rootConditions, b.rootConditions))
    return false;

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

  // Check if a.ownConditions is superset of b.ownConditions
  if (!isSelectorConditionsSuperset(a.ownConditions, b.ownConditions))
    return false;

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

function isSelectorConditionsSuperset(
  a: ParsedSelectorCondition[],
  b: ParsedSelectorCondition[],
): boolean {
  return isConditionsSuperset(a, b, getSelectorConditionKey);
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
 * Each variant becomes a separate selector in the comma-separated list,
 * or multiple CSS rules if they have different at-rules.
 *
 * Note: OR exclusivity is handled at the pipeline level (expandOrConditions),
 * so here we just collect all variants. Any remaining ORs in the condition
 * tree (e.g., from De Morgan expansion) are handled as simple alternatives.
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

  // Deduplicate variants
  return {
    variants: dedupeVariants(allVariants),
    isImpossible: false,
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
