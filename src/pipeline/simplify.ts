/**
 * Condition Simplification Engine
 *
 * Simplifies condition trees by applying boolean algebra rules,
 * detecting contradictions, merging ranges, and deduplicating terms.
 *
 * This is critical for:
 * 1. Detecting invalid combinations (A & !A → FALSE)
 * 2. Reducing CSS output size
 * 3. Producing cleaner selectors
 */

import { Lru } from '../parser/lru';

import type {
  ConditionNode,
  ContainerCondition,
  MediaCondition,
  ModifierCondition,
  NumericBound,
  OwnCondition,
  RootCondition,
} from './conditions';
import {
  and,
  createOwnCondition,
  createParentCondition,
  createRootCondition,
  falseCondition,
  getConditionUniqueId,
  not,
  or,
  trueCondition,
} from './conditions';

// ============================================================================
// Caching
// ============================================================================

const simplifyCache = new Lru<string, ConditionNode>(5000);

// ============================================================================
// Main Simplify Function
// ============================================================================

/**
 * Simplify a condition tree aggressively.
 *
 * This applies all possible simplification rules:
 * - Boolean algebra (identity, annihilator, idempotent, absorption)
 * - Contradiction detection (A & !A → FALSE)
 * - Tautology detection (A | !A → TRUE)
 * - Range intersection for numeric queries
 * - Attribute value conflict detection
 * - Deduplication and sorting
 */
export function simplifyCondition(node: ConditionNode): ConditionNode {
  // Check cache
  const key = getConditionUniqueId(node);
  const cached = simplifyCache.get(key);
  if (cached) {
    return cached;
  }

  const result = simplifyInner(node);

  // Cache result
  simplifyCache.set(key, result);

  return result;
}

/**
 * Clear the simplify cache (for testing)
 */
export function clearSimplifyCache(): void {
  simplifyCache.clear();
}

// ============================================================================
// Inner Simplification
// ============================================================================

function simplifyInner(node: ConditionNode): ConditionNode {
  // Base cases
  if (node.kind === 'true' || node.kind === 'false') {
    return node;
  }

  // State conditions: most are leaves, but @root / @own / @parent wrap a
  // nested condition that benefits from the same simplification (e.g.
  // `@root(schema=dark & schema=light)` → inner is FALSE → wrapper is FALSE).
  // Only descend on non-negated wrappers; negated wrappers would need
  // additional reasoning (`!@root(FALSE)` = TRUE) that isn't worth the
  // surface area for the current bug.
  if (node.kind === 'state') {
    if (
      (node.type === 'root' || node.type === 'own' || node.type === 'parent') &&
      !node.negated
    ) {
      const simplifiedInner = simplifyInner(node.innerCondition);
      if (simplifiedInner.kind === 'false') return falseCondition();
      if (simplifiedInner === node.innerCondition) return node;
      if (node.type === 'root') {
        return createRootCondition(simplifiedInner, false, node.raw);
      }
      if (node.type === 'own') {
        return createOwnCondition(simplifiedInner, false, node.raw);
      }
      return createParentCondition(
        simplifiedInner,
        node.direct,
        false,
        node.raw,
      );
    }
    return node;
  }

  // Compound conditions - recursively simplify.
  // Memoize compound results: the cross-level pruning pass
  // (`pruneContradictedOrBranches`) re-simplifies many overlapping
  // `AND(branch, ...siblings)` combinations, so caching by structural id
  // turns repeated work into O(1) lookups and tames otherwise exponential
  // blowup on wide exclusive conditions (large state maps).
  if (node.kind === 'compound') {
    const key = getConditionUniqueId(node);
    const cached = simplifyCache.get(key);
    if (cached) {
      return cached;
    }

    // First, recursively simplify all children
    const simplifiedChildren = node.children.map((c) => simplifyInner(c));

    // Then apply compound-specific simplifications
    const result =
      node.operator === 'AND'
        ? simplifyAnd(simplifiedChildren)
        : simplifyOr(simplifiedChildren);

    simplifyCache.set(key, result);
    return result;
  }

  return node;
}

// ============================================================================
// AND Simplification
// ============================================================================

function simplifyAnd(children: ConditionNode[]): ConditionNode {
  let terms: ConditionNode[] = [];

  // ─── Pass 1: flatten + identity/annihilator ────────────────────────────
  // Flatten nested ANDs, drop TRUE children, short-circuit on any FALSE.
  for (const child of children) {
    if (child.kind === 'false') {
      // AND with FALSE → FALSE
      return falseCondition();
    }
    if (child.kind === 'true') {
      // AND with TRUE → skip (identity)
      continue;
    }
    if (child.kind === 'compound' && child.operator === 'AND') {
      // Flatten nested AND
      terms.push(...child.children);
    } else {
      terms.push(child);
    }
  }

  // Empty → TRUE
  if (terms.length === 0) {
    return trueCondition();
  }

  // Single term → return it
  if (terms.length === 1) {
    return terms[0];
  }

  // ─── Pass 2: filter contradictions ─────────────────────────────────────
  // Any of these indicates the conjunction can never be satisfied.

  // Check for contradictions
  if (hasContradiction(terms)) {
    return falseCondition();
  }

  // Check for range contradictions in media/container queries
  if (hasRangeContradiction(terms)) {
    return falseCondition();
  }

  // Check for attribute value conflicts
  if (hasAttributeConflict(terms)) {
    return falseCondition();
  }

  // Check for container style query conflicts
  if (hasContainerStyleConflict(terms)) {
    return falseCondition();
  }

  // ─── Passes 3-5: redundancy elimination + boolean reductions ───────────
  // Run to a fixpoint: Pass 5 (`pruneContradictedOrBranches`) can collapse
  // single-branch ORs into flat AND siblings, which then expose fresh
  // implied negations for Pass 3 (`removeImpliedNegations`) and absorption
  // targets for Pass 4. Without re-running, an exclusive condition like
  // `[theme=gray] & OR(!proc, !theme=rose)` keeps a redundant
  // `:not([theme=rose])` term even though `[theme=gray]` already implies it.
  const MAX_SIMPLIFY_PASSES = 4;
  for (let pass = 0; pass < MAX_SIMPLIFY_PASSES; pass++) {
    const lengthBefore = terms.length;
    const keyBefore = simplifyTermsKey(terms);

    // Pass 3: redundancy elimination + canonicalization
    // Remove redundant negations implied by positive terms
    // e.g., style(--variant: danger) implies NOT style(--variant: success)
    // and style(--variant: danger) implies style(--variant) (existence)
    terms = removeImpliedNegations(terms);
    terms = deduplicateTerms(terms);
    terms = mergeRanges(terms);
    terms = sortTerms(terms);

    // Pass 4: boolean-algebra reductions
    terms = applyAbsorptionAnd(terms); // A & (A | B) → A
    terms = applyConsensusAnd(terms); // (A | B) & (A | !B) → A

    // Pass 5: cross-level contradiction pruning
    // A & OR(!A & X, Y) → A & Y
    // For each OR child, prune branches that are impossible given the other
    // AND siblings. This catches dead branches left by exclusive negation.
    terms = pruneContradictedOrBranches(terms);

    // Re-check contradictions exposed by pruning before continuing.
    if (terms.length === 0) break;
    if (terms.length === 1) break;
    if (hasContradiction(terms)) {
      return falseCondition();
    }
    if (hasAttributeConflict(terms)) {
      return falseCondition();
    }

    // Stop once a full pass made no structural change.
    if (
      terms.length === lengthBefore &&
      simplifyTermsKey(terms) === keyBefore
    ) {
      break;
    }
  }

  if (terms.length === 0) {
    return trueCondition();
  }
  if (terms.length === 1) {
    return terms[0];
  }

  return {
    kind: 'compound',
    operator: 'AND',
    children: terms,
  };
}

// ============================================================================
// OR Simplification
// ============================================================================

function simplifyOr(children: ConditionNode[]): ConditionNode {
  let terms: ConditionNode[] = [];

  // ─── Pass 1: flatten + identity/annihilator ────────────────────────────
  // Flatten nested ORs, drop FALSE children, short-circuit on any TRUE.
  for (const child of children) {
    if (child.kind === 'true') {
      // OR with TRUE → TRUE
      return trueCondition();
    }
    if (child.kind === 'false') {
      // OR with FALSE → skip (identity)
      continue;
    }
    if (child.kind === 'compound' && child.operator === 'OR') {
      // Flatten nested OR
      terms.push(...child.children);
    } else {
      terms.push(child);
    }
  }

  // Empty → FALSE
  if (terms.length === 0) {
    return falseCondition();
  }

  // Single term → return it
  if (terms.length === 1) {
    return terms[0];
  }

  // ─── Pass 2: filter tautologies ────────────────────────────────────────
  // A | !A means the disjunction is always satisfied.
  if (hasTautology(terms)) {
    return trueCondition();
  }

  // ─── Pass 3: redundancy elimination + canonicalization ─────────────────

  // Deduplicate
  terms = deduplicateTerms(terms);

  // Sort for canonical form
  terms = sortTerms(terms);

  // ─── Pass 4: boolean-algebra reductions ────────────────────────────────

  // Apply absorption: A | (A & B) → A
  terms = applyAbsorptionOr(terms);

  // Apply complementary factoring: (A & B) | (A & !B) → A
  terms = applyComplementaryFactoring(terms);

  if (terms.length === 0) {
    return falseCondition();
  }
  if (terms.length === 1) {
    return terms[0];
  }

  return {
    kind: 'compound',
    operator: 'OR',
    children: terms,
  };
}

// ============================================================================
// Contradiction Detection
// ============================================================================

/**
 * Check if any pair of terms has complementary negation (A and !A).
 * Used for both contradiction detection (in AND) and tautology detection (in OR),
 * since the underlying check is identical: the context determines the semantics.
 */
function hasComplementaryPair(terms: ConditionNode[]): boolean {
  const uniqueIds = new Set<string>();

  for (const term of terms) {
    if (term.kind !== 'state') continue;

    const id = term.uniqueId;
    const negatedId = term.negated ? id.slice(1) : `!${id}`;

    if (uniqueIds.has(negatedId)) {
      return true;
    }
    uniqueIds.add(id);
  }

  return false;
}

const hasContradiction = hasComplementaryPair;
const hasTautology = hasComplementaryPair;

// ============================================================================
// Range Contradiction Detection
// ============================================================================

/**
 * Effective bounds computed from conditions (including negated single-bound conditions)
 */
interface EffectiveBounds {
  lowerBound: number | null;
  lowerInclusive: boolean;
  upperBound: number | null;
  upperInclusive: boolean;
}

/**
 * Excluded range from a negated range condition
 */
interface ExcludedRange {
  lower: number;
  lowerInclusive: boolean;
  upper: number;
  upperInclusive: boolean;
}

/**
 * Check for range contradictions in media/container queries
 * e.g., @media(w < 400px) & @media(w > 800px) → FALSE
 *
 * Also handles negated conditions:
 * - Single-bound negations are inverted (not (w < 600px) → w >= 600px)
 * - Range negations create excluded ranges that are checked against positive bounds
 */
function hasRangeContradiction(terms: ConditionNode[]): boolean {
  // Group by dimension, separating positive and negated conditions
  const mediaByDim = new Map<
    string,
    { positive: MediaCondition[]; negated: MediaCondition[] }
  >();
  const containerByDim = new Map<
    string,
    { positive: ContainerCondition[]; negated: ContainerCondition[] }
  >();

  for (const term of terms) {
    if (term.kind !== 'state') continue;

    if (term.type === 'media' && term.subtype === 'dimension') {
      const key = term.dimension || 'width';
      if (!mediaByDim.has(key)) {
        mediaByDim.set(key, { positive: [], negated: [] });
      }
      const group = mediaByDim.get(key)!;
      if (term.negated) {
        group.negated.push(term);
      } else {
        group.positive.push(term);
      }
    }

    if (term.type === 'container' && term.subtype === 'dimension') {
      const key = `${term.containerName || '_'}:${term.dimension || 'width'}`;
      if (!containerByDim.has(key)) {
        containerByDim.set(key, { positive: [], negated: [] });
      }
      const group = containerByDim.get(key)!;
      if (term.negated) {
        group.negated.push(term);
      } else {
        group.positive.push(term);
      }
    }
  }

  // Check each dimension group for impossible ranges
  for (const group of mediaByDim.values()) {
    if (rangesAreImpossibleWithNegations(group.positive, group.negated)) {
      return true;
    }
  }

  for (const group of containerByDim.values()) {
    if (rangesAreImpossibleWithNegations(group.positive, group.negated)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if conditions are impossible, including negated conditions.
 *
 * For negated single-bound conditions:
 *   not (w < 600px) → w >= 600px (inverted to lower bound)
 *   not (w >= 800px) → w < 800px (inverted to upper bound)
 *
 * For negated range conditions:
 *   not (400px <= w < 800px) → excludes [400, 800)
 *   If the effective bounds fall entirely within an excluded range, it's impossible.
 */
function rangesAreImpossibleWithNegations(
  positive: (MediaCondition | ContainerCondition)[],
  negated: (MediaCondition | ContainerCondition)[],
): boolean {
  // Start with bounds from positive conditions
  const bounds = computeEffectiveBounds(positive);

  // Apply inverted bounds from single-bound negated conditions
  // and collect excluded ranges from range negated conditions
  const excludedRanges: ExcludedRange[] = [];

  for (const cond of negated) {
    const hasLower = cond.lowerBound?.valueNumeric != null;
    const hasUpper = cond.upperBound?.valueNumeric != null;

    if (hasLower && hasUpper) {
      // Range negation: not (lower <= w < upper) excludes [lower, upper)
      excludedRanges.push({
        lower: cond.lowerBound!.valueNumeric!,
        lowerInclusive: cond.lowerBound!.inclusive,
        upper: cond.upperBound!.valueNumeric!,
        upperInclusive: cond.upperBound!.inclusive,
      });
    } else if (hasUpper) {
      // not (w < upper) → w >= upper (becomes lower bound)
      // not (w <= upper) → w > upper (becomes lower bound, exclusive)
      const value = cond.upperBound!.valueNumeric!;
      const inclusive = !cond.upperBound!.inclusive; // flip inclusivity

      if (bounds.lowerBound === null || value > bounds.lowerBound) {
        bounds.lowerBound = value;
        bounds.lowerInclusive = inclusive;
      } else if (value === bounds.lowerBound && !inclusive) {
        bounds.lowerInclusive = false;
      }
    } else if (hasLower) {
      // not (w >= lower) → w < lower (becomes upper bound)
      // not (w > lower) → w <= lower (becomes upper bound, inclusive)
      const value = cond.lowerBound!.valueNumeric!;
      const inclusive = !cond.lowerBound!.inclusive; // flip inclusivity

      if (bounds.upperBound === null || value < bounds.upperBound) {
        bounds.upperBound = value;
        bounds.upperInclusive = inclusive;
      } else if (value === bounds.upperBound && !inclusive) {
        bounds.upperInclusive = false;
      }
    }
  }

  // Check if effective bounds are impossible on their own
  if (bounds.lowerBound !== null && bounds.upperBound !== null) {
    if (bounds.lowerBound > bounds.upperBound) {
      return true;
    }
    if (
      bounds.lowerBound === bounds.upperBound &&
      (!bounds.lowerInclusive || !bounds.upperInclusive)
    ) {
      return true;
    }
  }

  // Check if effective bounds fall entirely within any excluded range
  if (
    bounds.lowerBound !== null &&
    bounds.upperBound !== null &&
    excludedRanges.length > 0
  ) {
    for (const excluded of excludedRanges) {
      if (boundsWithinExcludedRange(bounds, excluded)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Compute effective bounds from positive (non-negated) conditions
 */
function computeEffectiveBounds(
  conditions: (MediaCondition | ContainerCondition)[],
): EffectiveBounds {
  let lowerBound: number | null = null;
  let lowerInclusive = false;
  let upperBound: number | null = null;
  let upperInclusive = false;

  for (const cond of conditions) {
    if (cond.lowerBound?.valueNumeric != null) {
      const value = cond.lowerBound.valueNumeric;
      const inclusive = cond.lowerBound.inclusive;

      if (lowerBound === null || value > lowerBound) {
        lowerBound = value;
        lowerInclusive = inclusive;
      } else if (value === lowerBound && !inclusive) {
        lowerInclusive = false;
      }
    }

    if (cond.upperBound?.valueNumeric != null) {
      const value = cond.upperBound.valueNumeric;
      const inclusive = cond.upperBound.inclusive;

      if (upperBound === null || value < upperBound) {
        upperBound = value;
        upperInclusive = inclusive;
      } else if (value === upperBound && !inclusive) {
        upperInclusive = false;
      }
    }
  }

  return { lowerBound, lowerInclusive, upperBound, upperInclusive };
}

/**
 * Check if effective bounds fall entirely within an excluded range.
 *
 * For example:
 *   Effective: [400, 800)
 *   Excluded:  [400, 800)
 *   → bounds fall entirely within excluded range → impossible
 */
function boundsWithinExcludedRange(
  bounds: EffectiveBounds,
  excluded: ExcludedRange,
): boolean {
  if (bounds.lowerBound === null || bounds.upperBound === null) {
    return false;
  }

  // Check if bounds.lower >= excluded.lower
  let lowerOk = false;
  if (bounds.lowerBound > excluded.lower) {
    lowerOk = true;
  } else if (bounds.lowerBound === excluded.lower) {
    // If excluded includes lower, and bounds includes or excludes lower, it's within
    // If excluded excludes lower, bounds must also exclude it to be within
    lowerOk = excluded.lowerInclusive || !bounds.lowerInclusive;
  }

  // Check if bounds.upper <= excluded.upper
  let upperOk = false;
  if (bounds.upperBound < excluded.upper) {
    upperOk = true;
  } else if (bounds.upperBound === excluded.upper) {
    // If excluded includes upper, and bounds includes or excludes upper, it's within
    // If excluded excludes upper, bounds must also exclude it to be within
    upperOk = excluded.upperInclusive || !bounds.upperInclusive;
  }

  return lowerOk && upperOk;
}

// ============================================================================
// Attribute Conflict Detection
// ============================================================================

/**
 * Check for attribute value conflicts
 * e.g., [data-theme="dark"] & [data-theme="light"] → FALSE
 * e.g., [data-theme="dark"] & ![data-theme] → FALSE
 */
/**
 * Generic value-conflict checker for grouped conditions.
 *
 * Groups terms by a key, splits into positive/negated, then checks:
 *   1. Multiple distinct positive values → conflict
 *   2. Positive value + negated existence (value === undefined) → conflict
 *   3. Positive value + negated same value → conflict
 */
function hasGroupedValueConflict<T extends { negated: boolean }>(
  terms: ConditionNode[],
  match: (term: ConditionNode) => T | null,
  groupKey: (term: T) => string,
  getValue: (term: T) => string | undefined,
): boolean {
  const groups = new Map<string, { positive: T[]; negated: T[] }>();

  for (const term of terms) {
    const matched = match(term);
    if (!matched) continue;

    const key = groupKey(matched);
    let group = groups.get(key);
    if (!group) {
      group = { positive: [], negated: [] };
      groups.set(key, group);
    }

    if (matched.negated) {
      group.negated.push(matched);
    } else {
      group.positive.push(matched);
    }
  }

  for (const [, group] of groups) {
    const positiveValues = group.positive
      .map(getValue)
      .filter((v) => v !== undefined);
    if (new Set(positiveValues).size > 1) return true;

    const hasPositiveValue = positiveValues.length > 0;
    const hasNegatedExistence = group.negated.some(
      (t) => getValue(t) === undefined,
    );
    if (hasPositiveValue && hasNegatedExistence) return true;

    for (const pos of group.positive) {
      const posVal = getValue(pos);
      if (posVal !== undefined) {
        for (const neg of group.negated) {
          if (getValue(neg) === posVal) return true;
        }
      }
    }
  }

  return false;
}

function hasAttributeConflict(terms: ConditionNode[]): boolean {
  // Top-level modifiers: `schema=dark & schema=light`.
  if (
    hasGroupedValueConflict<ModifierCondition>(
      terms,
      (t) => (t.kind === 'state' && t.type === 'modifier' ? t : null),
      (t) => t.attribute,
      (t) => t.value,
    )
  ) {
    return true;
  }

  // @root scope (single :root element):
  // `@root(schema=dark) & @root(schema=light)` cannot match anything because
  // there is only one document root.
  if (hasNestedModifierConflict(terms, 'root')) return true;

  // @own scope (single sub-element / styled element under `&`):
  // `@own(schema=dark) & @own(schema=light)` is impossible for the same
  // reason — both refer to the same element.
  if (hasNestedModifierConflict(terms, 'own')) return true;

  // NOTE: @parent is intentionally NOT checked. Different ancestor elements
  // can hold different attribute values, so two `@parent(schema=...)` calls
  // can both match (different ancestors), even when the values differ.

  return false;
}

/**
 * Collect modifier conditions inside non-negated state wrappers of `kind`
 * and check for the same value-conflict pattern as the top-level pass.
 *
 * Modifiers from multiple sibling wrappers are combined — both wrappers
 * scope to the same element (one :root, one own scope), so an attribute
 * conflict across wrappers is still impossible.
 */
function hasNestedModifierConflict(
  terms: ConditionNode[],
  wrapperType: 'root' | 'own',
): boolean {
  const innerTerms: ConditionNode[] = [];
  for (const term of terms) {
    if (term.kind === 'state' && term.type === wrapperType && !term.negated) {
      flattenAndIntoArray(
        (term as RootCondition | OwnCondition).innerCondition,
        innerTerms,
      );
    }
  }
  if (innerTerms.length < 2) return false;
  return hasGroupedValueConflict<ModifierCondition>(
    innerTerms,
    (t) => (t.kind === 'state' && t.type === 'modifier' ? t : null),
    (t) => t.attribute,
    (t) => t.value,
  );
}

/**
 * Flatten a top-level AND tree into a flat list of conjuncts. Non-AND nodes
 * are pushed as-is.
 */
function flattenAndIntoArray(node: ConditionNode, into: ConditionNode[]): void {
  if (node.kind === 'compound' && node.operator === 'AND') {
    for (const child of node.children) flattenAndIntoArray(child, into);
  } else {
    into.push(node);
  }
}

function hasContainerStyleConflict(terms: ConditionNode[]): boolean {
  return hasGroupedValueConflict<ContainerCondition>(
    terms,
    (t) =>
      t.kind === 'state' && t.type === 'container' && t.subtype === 'style'
        ? t
        : null,
    (t) => `${t.containerName || '_'}:${t.property}`,
    (t) => t.propertyValue,
  );
}

// ============================================================================
// Implied Negation Removal
// ============================================================================

/**
 * Remove negations that are implied by positive terms.
 *
 * Key optimizations:
 * 1. style(--variant: danger) implies NOT style(--variant: success)
 *    → If we have style(--variant: danger) & not style(--variant: success),
 *      the negation is redundant and can be removed.
 *
 * 2. [data-theme="dark"] implies NOT [data-theme="light"]
 *    → Same logic for attribute selectors.
 *
 * This produces cleaner CSS:
 *   Before: @container style(--variant: danger) and (not style(--variant: success))
 *   After:  @container style(--variant: danger)
 */
/**
 * Collect positive values from terms and build a "is this negation implied?" check.
 *
 * A negation is implied (redundant) when a positive term for the same group
 * already pins a specific value, making "NOT other-value" obvious.
 * e.g. style(--variant: danger) implies NOT style(--variant: success).
 */
function buildImpliedNegationCheck(
  terms: ConditionNode[],
): (term: ConditionNode) => boolean {
  const positiveValues = new Map<string, string>();
  const negatedBooleanAttrs = new Set<string>();

  for (const term of terms) {
    if (term.kind !== 'state') continue;

    if (!term.negated) {
      if (term.type === 'container' && term.subtype === 'style') {
        if (term.propertyValue !== undefined) {
          positiveValues.set(
            `c:${term.containerName || '_'}:${term.property}`,
            term.propertyValue,
          );
        }
      } else if (term.type === 'modifier' && term.value !== undefined) {
        positiveValues.set(`m:${term.attribute}`, term.value);
      }
    } else {
      // NOT [data-attr] (boolean negation) implies NOT [data-attr="val"]
      if (term.type === 'modifier' && term.value === undefined) {
        negatedBooleanAttrs.add(term.attribute);
      }
    }
  }

  return (term: ConditionNode): boolean => {
    if (term.kind !== 'state' || !term.negated) return false;

    if (term.type === 'container' && term.subtype === 'style') {
      if (term.propertyValue === undefined) return false;
      const pos = positiveValues.get(
        `c:${term.containerName || '_'}:${term.property}`,
      );
      return pos !== undefined && term.propertyValue !== pos;
    }

    if (term.type === 'modifier' && term.value !== undefined) {
      // :not([data-attr]) already present → :not([data-attr="val"]) is redundant
      if (negatedBooleanAttrs.has(term.attribute)) return true;
      const pos = positiveValues.get(`m:${term.attribute}`);
      return pos !== undefined && term.value !== pos;
    }

    return false;
  };
}

function removeImpliedNegations(terms: ConditionNode[]): ConditionNode[] {
  const isImplied = buildImpliedNegationCheck(terms);
  return terms.filter((t) => !isImplied(t));
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Build a stable, order-insensitive key for a list of AND terms.
 * Used to detect fixpoint convergence in `simplifyAnd`.
 */
function simplifyTermsKey(terms: ConditionNode[]): string {
  return terms
    .map((t) => getConditionUniqueId(t))
    .sort()
    .join('&');
}

function deduplicateTerms(terms: ConditionNode[]): ConditionNode[] {
  const seen = new Set<string>();
  const result: ConditionNode[] = [];

  for (const term of terms) {
    const id = getConditionUniqueId(term);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(term);
    }
  }

  return result;
}

// ============================================================================
// Range Merging
// ============================================================================

/**
 * Merge compatible range conditions
 * e.g., @media(w >= 400px) & @media(w <= 800px) → @media(400px <= w <= 800px)
 */
function mergeRanges(terms: ConditionNode[]): ConditionNode[] {
  // Group media conditions by dimension
  const mediaByDim = new Map<
    string,
    { conditions: MediaCondition[]; indices: number[] }
  >();
  const containerByDim = new Map<
    string,
    { conditions: ContainerCondition[]; indices: number[] }
  >();

  terms.forEach((term, index) => {
    if (term.kind !== 'state') return;

    if (
      term.type === 'media' &&
      term.subtype === 'dimension' &&
      !term.negated
    ) {
      const key = term.dimension || 'width';
      if (!mediaByDim.has(key)) {
        mediaByDim.set(key, { conditions: [], indices: [] });
      }
      const group = mediaByDim.get(key)!;
      group.conditions.push(term);
      group.indices.push(index);
    }

    if (
      term.type === 'container' &&
      term.subtype === 'dimension' &&
      !term.negated
    ) {
      const key = `${term.containerName || '_'}:${term.dimension || 'width'}`;
      if (!containerByDim.has(key)) {
        containerByDim.set(key, { conditions: [], indices: [] });
      }
      const group = containerByDim.get(key)!;
      group.conditions.push(term);
      group.indices.push(index);
    }
  });

  // Track indices to remove
  const indicesToRemove = new Set<number>();
  const mergedTerms: ConditionNode[] = [];

  // Merge media conditions
  for (const [_dim, group] of mediaByDim) {
    if (group.conditions.length > 1) {
      const merged = mergeMediaRanges(group.conditions);
      if (merged) {
        group.indices.forEach((i) => indicesToRemove.add(i));
        mergedTerms.push(merged);
      }
    }
  }

  // Merge container conditions
  for (const [, group] of containerByDim) {
    if (group.conditions.length > 1) {
      const merged = mergeContainerRanges(group.conditions);
      if (merged) {
        group.indices.forEach((i) => indicesToRemove.add(i));
        mergedTerms.push(merged);
      }
    }
  }

  // Build result
  const result: ConditionNode[] = [];
  terms.forEach((term, index) => {
    if (!indicesToRemove.has(index)) {
      result.push(term);
    }
  });
  result.push(...mergedTerms);

  return result;
}

/**
 * Tighten bounds by picking the most restrictive lower and upper bounds
 * from a set of conditions that have lowerBound/upperBound fields.
 */
function tightenBounds(
  conditions: { lowerBound?: NumericBound; upperBound?: NumericBound }[],
): { lowerBound?: NumericBound; upperBound?: NumericBound } {
  let lowerBound: NumericBound | undefined;
  let upperBound: NumericBound | undefined;

  for (const cond of conditions) {
    if (cond.lowerBound) {
      if (
        !lowerBound ||
        (cond.lowerBound.valueNumeric ?? -Infinity) >
          (lowerBound.valueNumeric ?? -Infinity)
      ) {
        lowerBound = cond.lowerBound;
      }
    }
    if (cond.upperBound) {
      if (
        !upperBound ||
        (cond.upperBound.valueNumeric ?? Infinity) <
          (upperBound.valueNumeric ?? Infinity)
      ) {
        upperBound = cond.upperBound;
      }
    }
  }

  return { lowerBound, upperBound };
}

function appendBoundsToUniqueId(
  parts: string[],
  lowerBound?: NumericBound,
  upperBound?: NumericBound,
): void {
  if (lowerBound) {
    parts.push(lowerBound.inclusive ? '>=' : '>');
    parts.push(lowerBound.value);
  }
  if (upperBound) {
    parts.push(upperBound.inclusive ? '<=' : '<');
    parts.push(upperBound.value);
  }
}

function mergeDimensionRanges<T extends MediaCondition | ContainerCondition>(
  conditions: T[],
  idPrefix: string[],
): T | null {
  if (conditions.length === 0) return null;

  const { lowerBound, upperBound } = tightenBounds(conditions);
  const base = conditions[0];

  const parts = [...idPrefix];
  appendBoundsToUniqueId(parts, lowerBound, upperBound);

  return {
    ...base,
    negated: false,
    raw: buildMergedRaw(base.dimension || 'width', lowerBound, upperBound),
    uniqueId: parts.join(':'),
    lowerBound,
    upperBound,
  };
}

function mergeMediaRanges(conditions: MediaCondition[]): MediaCondition | null {
  const dim = conditions[0]?.dimension ?? 'width';
  return mergeDimensionRanges(conditions, ['media', 'dim', dim]);
}

function mergeContainerRanges(
  conditions: ContainerCondition[],
): ContainerCondition | null {
  const base = conditions[0];
  if (!base) return null;
  const name = base.containerName || '_';
  const dim = base.dimension ?? 'width';
  return mergeDimensionRanges(conditions, ['container', 'dim', name, dim]);
}

function buildMergedRaw(
  dimension: string,
  lowerBound?: NumericBound,
  upperBound?: NumericBound,
): string {
  if (lowerBound && upperBound) {
    const lowerOp = lowerBound.inclusive ? '<=' : '<';
    const upperOp = upperBound.inclusive ? '<=' : '<';
    return `@media(${lowerBound.value} ${lowerOp} ${dimension} ${upperOp} ${upperBound.value})`;
  } else if (upperBound) {
    const op = upperBound.inclusive ? '<=' : '<';
    return `@media(${dimension} ${op} ${upperBound.value})`;
  } else if (lowerBound) {
    const op = lowerBound.inclusive ? '>=' : '>';
    return `@media(${dimension} ${op} ${lowerBound.value})`;
  }
  return '@media()';
}

// ============================================================================
// Complementary Factoring
// ============================================================================

/**
 * Apply complementary factoring: (A & B) | (A & !B) → A
 *
 * Finds pairs of AND compounds that share all children except one,
 * where the differing child is complementary (X vs !X).
 * Replaces the pair with the common terms.
 *
 * This is applied iteratively until no more reductions are possible,
 * since factoring can expose further simplification opportunities.
 */
function applyComplementaryFactoring(terms: ConditionNode[]): ConditionNode[] {
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < terms.length; i++) {
      const a = terms[i];
      if (a.kind !== 'compound' || a.operator !== 'AND') continue;

      for (let j = i + 1; j < terms.length; j++) {
        const b = terms[j];
        if (b.kind !== 'compound' || b.operator !== 'AND') continue;

        const factored = tryFactorPair(a.children, b.children);
        if (factored) {
          const replacement = simplifyInner(factored);
          terms = [
            ...terms.slice(0, i),
            ...terms.slice(i + 1, j),
            ...terms.slice(j + 1),
            replacement,
          ];
          changed = true;
          break;
        }
      }

      if (changed) break;
    }
  }

  return terms;
}

/**
 * Try to factor two AND children lists.
 *
 * Extracts the common children (by uniqueId). If the remaining
 * (non-common) parts of each side OR to TRUE, the common part alone
 * is sufficient: `(common & restA) | (common & restB) → common`
 * when `restA | restB → TRUE`.
 *
 * Also handles the simpler case where exactly one child is
 * complementary: `[A, B, C]` and `[A, !B, C]` → `AND(A, C)`.
 */
function tryFactorPair(
  aChildren: ConditionNode[],
  bChildren: ConditionNode[],
): ConditionNode | null {
  const aIds = aChildren.map((c) => getConditionUniqueId(c));
  const bIds = bChildren.map((c) => getConditionUniqueId(c));

  const bIdSet = new Set(bIds);
  const aIdSet = new Set(aIds);

  // Extract common children (present in both by uniqueId)
  const commonIndicesA: number[] = [];
  const restIndicesA: number[] = [];
  for (let i = 0; i < aIds.length; i++) {
    if (bIdSet.has(aIds[i])) {
      commonIndicesA.push(i);
    } else {
      restIndicesA.push(i);
    }
  }

  const restIndicesB: number[] = [];
  for (let i = 0; i < bIds.length; i++) {
    if (!aIdSet.has(bIds[i])) {
      restIndicesB.push(i);
    }
  }

  // Must have at least one common child and differing parts on both sides
  if (commonIndicesA.length === 0) return null;
  if (restIndicesA.length === 0 && restIndicesB.length === 0) return null;

  // Build the "rest" conditions for each side
  const restA =
    restIndicesA.length === 0
      ? trueCondition()
      : restIndicesA.length === 1
        ? aChildren[restIndicesA[0]]
        : and(...restIndicesA.map((i) => aChildren[i]));

  const restB =
    restIndicesB.length === 0
      ? trueCondition()
      : restIndicesB.length === 1
        ? bChildren[restIndicesB[0]]
        : and(...restIndicesB.map((i) => bChildren[i]));

  // Check if restA | restB simplifies to TRUE
  const combined = simplifyInner({
    kind: 'compound',
    operator: 'OR',
    children: [restA, restB],
  });

  if (combined.kind !== 'true') {
    // Direct complement check for compound conditions.
    // hasTautology only detects leaf-level A/!A pairs, so compound
    // complements like @hc / !@hc (which expand via De Morgan into
    // structurally different trees) are missed. Compare the simplified
    // negation of one rest against the simplified other rest instead.
    const simplifiedRestB = simplifyInner(restB);
    const negRestA = simplifyInner(not(restA));

    if (
      getConditionUniqueId(negRestA) !== getConditionUniqueId(simplifiedRestB)
    ) {
      return null;
    }
  }

  // restA | restB = TRUE → (common & restA) | (common & restB) = common
  const common = commonIndicesA.map((i) => aChildren[i]);

  if (common.length === 0) {
    return trueCondition();
  }
  if (common.length === 1) {
    return common[0];
  }
  return and(...common);
}

// ============================================================================
// Sorting
// ============================================================================

function sortTerms(terms: ConditionNode[]): ConditionNode[] {
  const withIds = terms.map((t) => [getConditionUniqueId(t), t] as const);
  withIds.sort((a, b) => a[0].localeCompare(b[0]));
  return withIds.map(([, t]) => t);
}

// ============================================================================
// Absorption
// ============================================================================

/**
 * Apply the absorption law: removes compound terms that are absorbed by
 * another term already present (simple or compound).
 *
 * For AND context: A & (A | B) → A  (absorbs OR compounds)
 * For OR  context: A | (A & B) → A  (absorbs AND compounds)
 *
 * After flattening, a compound A = OR(X, Y) becomes [X, Y, ...] in the
 * outer OR. A child AND(A, B) = AND(OR(X, Y), B) still references the
 * original un-flattened compound. We reconstruct possible compound
 * absorbers from the flattened terms so absorption works across nesting.
 */
function applyAbsorption(
  terms: ConditionNode[],
  absorbedOperator: 'OR' | 'AND',
): ConditionNode[] {
  // Collect IDs of ALL top-level terms as potential absorbers.
  const absorberIds = new Set<string>();
  for (const term of terms) {
    absorberIds.add(getConditionUniqueId(term));
  }

  // Reconstruct compound absorbers: if all children of a compound node
  // (found inside an absorbable term) are themselves absorbers, then
  // that compound is also an absorber. This handles the case where
  // A = OR(X, Y) was flattened into [X, Y, ...] at the top level,
  // but appears un-flattened as a child of AND(A, B).
  let changed = true;
  while (changed) {
    changed = false;
    for (const term of terms) {
      if (term.kind !== 'compound' || term.operator !== absorbedOperator) {
        continue;
      }
      for (const child of term.children) {
        if (child.kind !== 'compound') continue;
        const childId = getConditionUniqueId(child);
        if (absorberIds.has(childId)) continue;
        if (
          child.children.every((c) => absorberIds.has(getConditionUniqueId(c)))
        ) {
          absorberIds.add(childId);
          changed = true;
        }
      }
    }
  }

  return terms.filter((term) => {
    if (term.kind === 'compound' && term.operator === absorbedOperator) {
      for (const child of term.children) {
        if (absorberIds.has(getConditionUniqueId(child))) {
          return false;
        }
      }
    }
    return true;
  });
}

function applyAbsorptionAnd(terms: ConditionNode[]): ConditionNode[] {
  return applyAbsorption(terms, 'OR');
}

function applyAbsorptionOr(terms: ConditionNode[]): ConditionNode[] {
  return applyAbsorption(terms, 'AND');
}

// ============================================================================
// Consensus / Resolution (AND dual of complementary factoring)
// ============================================================================

/**
 * Apply the consensus/resolution rule for AND:
 *   (A | B) & (A | !B) → A
 *
 * This is the dual of complementary factoring in OR context:
 *   (A & B) | (A & !B) → A
 *
 * Extracts common children from two OR terms. If the remaining
 * parts of each side AND to FALSE, the common part alone is
 * sufficient.
 */
function applyConsensusAnd(terms: ConditionNode[]): ConditionNode[] {
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < terms.length; i++) {
      const a = terms[i];
      if (a.kind !== 'compound' || a.operator !== 'OR') continue;

      for (let j = i + 1; j < terms.length; j++) {
        const b = terms[j];
        if (b.kind !== 'compound' || b.operator !== 'OR') continue;

        const resolved = tryResolvePair(a.children, b.children);
        if (resolved) {
          const replacement = simplifyInner(resolved);
          terms = [
            ...terms.slice(0, i),
            ...terms.slice(i + 1, j),
            ...terms.slice(j + 1),
            replacement,
          ];
          changed = true;
          break;
        }
      }

      if (changed) break;
    }
  }

  return terms;
}

/**
 * Try to resolve two OR children lists.
 *
 * Extracts common children (by uniqueId). If the remaining
 * (non-common) parts AND to FALSE, the common part alone
 * is sufficient: `(common | restA) & (common | restB) → common`
 * when `restA & restB → FALSE`.
 */
function tryResolvePair(
  aChildren: ConditionNode[],
  bChildren: ConditionNode[],
): ConditionNode | null {
  const aIds = aChildren.map((c) => getConditionUniqueId(c));
  const bIds = bChildren.map((c) => getConditionUniqueId(c));

  const bIdSet = new Set(bIds);
  const aIdSet = new Set(aIds);

  const commonIndicesA: number[] = [];
  const restIndicesA: number[] = [];
  for (let i = 0; i < aIds.length; i++) {
    if (bIdSet.has(aIds[i])) {
      commonIndicesA.push(i);
    } else {
      restIndicesA.push(i);
    }
  }

  const restIndicesB: number[] = [];
  for (let i = 0; i < bIds.length; i++) {
    if (!aIdSet.has(bIds[i])) {
      restIndicesB.push(i);
    }
  }

  if (commonIndicesA.length === 0) return null;
  if (restIndicesA.length === 0 && restIndicesB.length === 0) return null;

  const restA =
    restIndicesA.length === 0
      ? falseCondition()
      : restIndicesA.length === 1
        ? aChildren[restIndicesA[0]]
        : or(...restIndicesA.map((i) => aChildren[i]));

  const restB =
    restIndicesB.length === 0
      ? falseCondition()
      : restIndicesB.length === 1
        ? bChildren[restIndicesB[0]]
        : or(...restIndicesB.map((i) => bChildren[i]));

  // Check if restA & restB simplifies to FALSE
  const combined = simplifyInner({
    kind: 'compound',
    operator: 'AND',
    children: [restA, restB],
  });

  if (combined.kind !== 'false') {
    // Direct complement check for compound conditions
    const simplifiedRestB = simplifyInner(restB);
    const negRestA = simplifyInner(not(restA));

    if (
      getConditionUniqueId(negRestA) !== getConditionUniqueId(simplifiedRestB)
    ) {
      return null;
    }
  }

  // restA & restB = FALSE → (common | restA) & (common | restB) = common
  const common = commonIndicesA.map((i) => aChildren[i]);

  if (common.length === 0) {
    return falseCondition();
  }
  if (common.length === 1) {
    return common[0];
  }
  return or(...common);
}

// ============================================================================
// Cross-level Contradiction Pruning
// ============================================================================

/**
 * For each OR child of an AND, prune branches that are impossible
 * given the other AND siblings.
 *
 * Example: A & OR(!A & X, Y) → A & Y
 *
 * This catches dead OR branches left by exclusive negation (Stage 2b)
 * where `NOT(combined)` introduces branches contradicting flat siblings.
 */
function pruneContradictedOrBranches(terms: ConditionNode[]): ConditionNode[] {
  const hasOr = terms.some((t) => t.kind === 'compound' && t.operator === 'OR');
  if (!hasOr) return terms;

  let changed = false;
  const result: ConditionNode[] = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (term.kind !== 'compound' || term.operator !== 'OR') {
      result.push(term);
      continue;
    }

    // Gather all siblings (everything except this OR)
    const siblings = [...terms.slice(0, i), ...terms.slice(i + 1)];

    const surviving: ConditionNode[] = [];
    for (const branch of term.children) {
      const test: ConditionNode = {
        kind: 'compound',
        operator: 'AND',
        children: [branch, ...siblings],
      };
      const simplified = simplifyInner(test);
      if (simplified.kind !== 'false') {
        surviving.push(branch);
      }
    }

    if (surviving.length === term.children.length) {
      result.push(term);
    } else if (surviving.length === 0) {
      return [falseCondition()];
    } else {
      changed = true;
      if (surviving.length === 1) {
        result.push(surviving[0]);
      } else {
        result.push({
          kind: 'compound',
          operator: 'OR',
          children: surviving,
        });
      }
    }
  }

  if (!changed) return terms;

  // Re-flatten after pruning may have unwrapped single-branch ORs
  const flattened: ConditionNode[] = [];
  for (const term of result) {
    if (term.kind === 'compound' && term.operator === 'AND') {
      flattened.push(...term.children);
    } else {
      flattened.push(term);
    }
  }

  return flattened;
}
