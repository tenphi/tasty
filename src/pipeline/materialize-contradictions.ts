/**
 * Contradiction Detection for Parsed CSS Conditions
 *
 * After conditions are converted into their parsed CSS shapes
 * (`ParsedMediaCondition`, `ParsedContainerCondition`,
 * `ParsedSupportsCondition`), variant merging in `materialize.ts` needs to
 * detect impossible combinations a second time at this lower level — the
 * tree-level simplifier in `simplify.ts` operates on `ConditionNode`s,
 * which can't see post-parse details like dimension bounds collapsing or
 * style-query property conflicts.
 *
 * Functions in this module are pure and self-contained; they take parsed
 * conditions and return booleans. They share no state with each other or
 * with the rest of the materialization pipeline.
 */

import type {
  ParsedContainerCondition,
  ParsedMediaCondition,
  ParsedSupportsCondition,
} from './materialize-types';

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

export function dedupeMediaConditions(
  conditions: ParsedMediaCondition[],
): ParsedMediaCondition[] {
  return dedupeByKey(
    conditions,
    (c) => `${c.subtype}|${c.condition}|${c.negated}`,
  );
}

export function dedupeContainerConditions(
  conditions: ParsedContainerCondition[],
): ParsedContainerCondition[] {
  return dedupeByKey(
    conditions,
    (c) => `${c.name ?? ''}|${c.condition}|${c.negated}`,
  );
}

export function dedupeSupportsConditions(
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
export function hasSupportsContradiction(
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
export function hasMediaContradiction(
  conditions: ParsedMediaCondition[],
): boolean {
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
export function hasContainerStyleContradiction(
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
