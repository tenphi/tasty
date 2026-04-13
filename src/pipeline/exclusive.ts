/**
 * Exclusive Condition Builder
 *
 * Transforms parsed style entries into exclusive conditions.
 * Each entry's condition is ANDed with the negation of all higher-priority conditions,
 * ensuring exactly one condition matches at any given time.
 */

import type { StyleValue } from '../utils/styles';

import type { ConditionNode } from './conditions';
import { and, isCompoundCondition, not, or, trueCondition } from './conditions';
import { simplifyCondition } from './simplify';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed style entry with condition
 */
export interface ParsedStyleEntry {
  styleKey: string; // e.g., 'padding', 'fill'
  stateKey: string; // Original key: '', 'compact', '@media(w < 768px)'
  value: StyleValue; // The style value (before handler processing)
  condition: ConditionNode; // Parsed condition tree
  priority: number; // Order in original object (higher = higher priority)
}

/**
 * Style entry with exclusive condition
 */
export interface ExclusiveStyleEntry extends ParsedStyleEntry {
  exclusiveCondition: ConditionNode; // condition & !higherPriorityConditions
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Build exclusive conditions for a list of parsed style entries.
 *
 * The entries should be ordered by priority (highest priority first).
 *
 * For each entry, we compute:
 *   exclusiveCondition = condition & !prior[0] & !prior[1] & ...
 *
 * This ensures exactly one condition matches at any time.
 *
 * Example:
 *   Input (ordered highest to lowest priority):
 *     A: value1 (priority 2)
 *     B: value2 (priority 1)
 *     C: value3 (priority 0)
 *
 *   Output:
 *     A: A
 *     B: B & !A
 *     C: C & !A & !B
 *
 * @param entries Parsed style entries ordered by priority (highest first)
 * @returns Entries with exclusive conditions, filtered to remove impossible ones
 */
export function buildExclusiveConditions(
  entries: ParsedStyleEntry[],
): ExclusiveStyleEntry[] {
  const result: ExclusiveStyleEntry[] = [];
  const priorConditions: ConditionNode[] = [];

  for (const entry of entries) {
    // Build: condition & !prior[0] & !prior[1] & ...
    let exclusive: ConditionNode = entry.condition;

    for (const prior of priorConditions) {
      // Skip negating "always true" (default state) - it would become "always false"
      if (prior.kind !== 'true') {
        exclusive = and(exclusive, not(prior));
      }
    }

    // Simplify the exclusive condition
    const simplified = simplifyCondition(exclusive);

    // Skip impossible conditions (simplified to FALSE)
    if (simplified.kind === 'false') {
      continue;
    }

    result.push({
      ...entry,
      exclusiveCondition: simplified,
    });

    // Add non-default conditions to prior list for subsequent entries
    if (entry.condition.kind !== 'true') {
      priorConditions.push(entry.condition);
    }
  }

  return result;
}

/**
 * Parse style entries from a value mapping object.
 *
 * @param styleKey The style key (e.g., 'padding')
 * @param valueMap The value mapping { '': '2x', 'compact': '1x', '@media(w < 768px)': '0.5x' }
 * @param parseCondition Function to parse state keys into conditions
 * @returns Parsed entries ordered by priority (highest first)
 */
export function parseStyleEntries(
  styleKey: string,
  valueMap: Record<string, StyleValue>,
  parseCondition: (stateKey: string) => ConditionNode,
): ParsedStyleEntry[] {
  const entries: ParsedStyleEntry[] = [];
  const keys = Object.keys(valueMap);

  keys.forEach((stateKey, index) => {
    const value = valueMap[stateKey];
    const condition =
      stateKey === '' ? trueCondition() : parseCondition(stateKey);

    entries.push({
      styleKey,
      stateKey,
      value,
      condition,
      priority: index,
    });
  });

  // Reverse so highest priority (last in object) comes first for exclusive building
  // buildExclusiveConditions expects highest priority first
  entries.reverse();

  return entries;
}

/**
 * Merge parsed entries that share the same value.
 *
 * When multiple **non-default** state keys map to the same value, their
 * conditions can be combined with OR and treated as a single entry.
 * This must happen **before** exclusive expansion and OR branch splitting
 * to avoid combinatorial explosion and duplicate CSS output.
 *
 * Default (TRUE) entries are **never** merged with non-default entries.
 * Merging `TRUE | X` collapses to `TRUE`, destroying the non-default
 * condition's participation in exclusive building. That causes
 * intermediate-priority states to lose their `:not(X)` negation,
 * breaking mutual exclusivity when X and an intermediate state are
 * both active. Stage 6 `mergeByValue` handles combining rules with
 * identical CSS output after exclusive conditions are correctly built.
 *
 * Example: `{ '@dark': 'red', '@dark & @hc': 'red' }` merges into a
 * single entry with condition `@dark | (@dark & @hc)` = `@dark`.
 *
 * Entries are ordered highest-priority-first. The merged entry keeps the
 * highest priority of the group.
 */
export function mergeEntriesByValue(
  entries: ParsedStyleEntry[],
): ParsedStyleEntry[] {
  if (entries.length <= 1) return entries;

  const groups = new Map<
    string,
    { entries: ParsedStyleEntry[]; maxPriority: number }
  >();

  for (const entry of entries) {
    const valueKey = serializeValue(entry.value);
    const group = groups.get(valueKey);
    if (group) {
      group.entries.push(entry);
      group.maxPriority = Math.max(group.maxPriority, entry.priority);
    } else {
      groups.set(valueKey, { entries: [entry], maxPriority: entry.priority });
    }
  }

  // If no merges possible, return as-is
  if (groups.size === entries.length) return entries;

  const merged: ParsedStyleEntry[] = [];
  for (const [, group] of groups) {
    if (group.entries.length === 1) {
      merged.push(group.entries[0]);
      continue;
    }

    // Separate default (TRUE) entries from non-default entries.
    // Default entries must stay separate so that non-default conditions
    // participate in exclusive building and block intermediate states.
    const defaultEntries = group.entries.filter(
      (e) => e.condition.kind === 'true',
    );
    const nonDefaultEntries = group.entries.filter(
      (e) => e.condition.kind !== 'true',
    );

    // Keep default entries as-is
    for (const entry of defaultEntries) {
      merged.push(entry);
    }

    // Merge only non-default entries
    if (nonDefaultEntries.length === 1) {
      merged.push(nonDefaultEntries[0]);
    } else if (nonDefaultEntries.length >= 2) {
      const combinedCondition = simplifyCondition(
        or(...nonDefaultEntries.map((e) => e.condition)),
      );

      const combinedStateKey = nonDefaultEntries
        .map((e) => e.stateKey)
        .join(' | ');

      merged.push({
        styleKey: nonDefaultEntries[0].styleKey,
        stateKey: combinedStateKey,
        value: nonDefaultEntries[0].value,
        condition: combinedCondition,
        priority: group.maxPriority,
      });
    }
  }

  // Re-sort by priority (highest first)
  merged.sort((a, b) => b.priority - a.priority);

  return merged;
}

function serializeValue(value: StyleValue): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

// ============================================================================
// Compound State Extraction
// ============================================================================

/**
 * Eliminate redundant state dimensions from a value map.
 *
 * When a value map contains compound AND state keys (e.g. `@dark & @hc`),
 * checks whether any state atom is a "don't-care" variable — i.e. the
 * value is the same whether that atom is present or absent. Redundant
 * atoms are removed from all keys and duplicate entries are collapsed.
 *
 * This runs **before** condition parsing so that downstream stages
 * (`mergeEntriesByValue`, `buildExclusiveConditions`, materialization)
 * never see the irrelevant dimension, producing simpler, smaller CSS.
 *
 * Only pure top-level AND combinations are eligible. Keys that contain
 * `|`, `^`, or `,` at the top level are treated as opaque single atoms.
 *
 * @example
 *   { '': A, '@dark': B, '@hc': A, '@dark & @hc': B }
 *   // @hc is redundant → { '': A, '@dark': B }
 */
export function extractCompoundStates(
  valueMap: Record<string, StyleValue>,
): Record<string, StyleValue> {
  const keys = Object.keys(valueMap);

  if (keys.length < 3 || !keys.some((k) => k.includes('&'))) {
    return valueMap;
  }

  const entries = keys.map((key) => {
    const atoms = splitTopLevelAnd(key);
    return {
      // null means the key has non-AND operators; treat the whole key
      // as a single opaque atom so it never matches partial pairs.
      atoms: atoms ?? [key],
      value: valueMap[key],
    };
  });

  const allAtoms = new Set<string>();
  for (const e of entries) {
    for (const a of e.atoms) allAtoms.add(a);
  }

  const redundant = new Set<string>();
  for (const atom of allAtoms) {
    if (isAtomRedundant(entries, atom)) {
      redundant.add(atom);
    }
  }

  if (redundant.size === 0) return valueMap;

  const newMap: Record<string, StyleValue> = {};
  for (const e of entries) {
    const filtered = e.atoms.filter((a) => !redundant.has(a));
    const newKey = filtered.join(' & ');
    if (!(newKey in newMap)) {
      newMap[newKey] = e.value;
    }
  }

  return newMap;
}

/**
 * Split a state key by top-level `&` operators.
 *
 * Returns `null` if the key contains `|`, `^`, or `,` at the top level
 * (making it ineligible for atom-level extraction).
 * Returns `[]` for the empty string (default key).
 */
function splitTopLevelAnd(key: string): string[] | null {
  if (key === '') return [];

  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of key) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;

    if (depth === 0) {
      if (ch === '&') {
        const trimmed = current.trim();
        if (trimmed) parts.push(trimmed);
        current = '';
        continue;
      }
      if (ch === '|' || ch === '^' || ch === ',') {
        return null;
      }
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);

  return parts;
}

/**
 * An atom is redundant when every entry that contains it has a matching
 * partner (same remaining atoms, atom absent) with the same value.
 */
function isAtomRedundant(
  entries: { atoms: string[]; value: StyleValue }[],
  atom: string,
): boolean {
  const withAtom = entries.filter((e) => e.atoms.includes(atom));
  if (withAtom.length === 0) return false;

  for (const wa of withAtom) {
    const remaining = wa.atoms.filter((a) => a !== atom);

    const pair = entries.find(
      (e) =>
        !e.atoms.includes(atom) &&
        e.atoms.length === remaining.length &&
        remaining.every((r) => e.atoms.includes(r)),
    );

    if (!pair) return false;
    if (serializeValue(wa.value) !== serializeValue(pair.value)) return false;
  }

  return true;
}

/**
 * Check if a value is a style value mapping (object with state keys)
 */
export function isValueMapping(
  value: StyleValue | Record<string, StyleValue>,
): value is Record<string, StyleValue> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

// ============================================================================
// OR Expansion
// ============================================================================

/**
 * Expand OR conditions in parsed entries into multiple exclusive entries.
 *
 * For an entry with condition `A | B | C`, this creates 3 entries:
 *   - condition: A
 *   - condition: B & !A
 *   - condition: C & !A & !B
 *
 * This ensures OR branches are mutually exclusive BEFORE the main
 * exclusive condition building pass.
 *
 * @param entries Parsed entries (may contain OR conditions)
 * @returns Expanded entries with OR branches made exclusive
 */
export function expandOrConditions(
  entries: ParsedStyleEntry[],
): ParsedStyleEntry[] {
  const result: ParsedStyleEntry[] = [];

  for (const entry of entries) {
    const expanded = expandSingleEntry(entry);
    result.push(...expanded);
  }

  return result;
}

/**
 * Expand a single entry's OR condition into multiple exclusive entries.
 *
 * Note: branches are NOT sorted by at-rule context here (unlike the
 * `expandExclusiveOrs` pass below). User-authored ORs in state keys aren't
 * the product of De Morgan negation, so each branch is expected to render
 * independently in its own scope and at-rule sort isn't load-bearing.
 * The post-build pass needs the sort because it has to preserve at-rule
 * wrapping across branches that came from negating a compound at-rule.
 */
function expandSingleEntry(entry: ParsedStyleEntry): ParsedStyleEntry[] {
  const orBranches = collectOrBranches(entry.condition);

  // If no OR (single branch), return as-is
  if (orBranches.length <= 1) {
    return [entry];
  }

  // Make each OR branch exclusive from prior branches
  const result: ParsedStyleEntry[] = [];
  const priorBranches: ConditionNode[] = [];

  for (let i = 0; i < orBranches.length; i++) {
    const branch = orBranches[i];

    // Build: branch & !prior[0] & !prior[1] & ...
    let exclusiveBranch: ConditionNode = branch;
    for (const prior of priorBranches) {
      exclusiveBranch = and(exclusiveBranch, not(prior));
    }

    // Simplify to detect impossible combinations
    const simplified = simplifyCondition(exclusiveBranch);

    // Skip impossible branches
    if (simplified.kind === 'false') {
      priorBranches.push(branch);
      continue;
    }

    result.push({
      ...entry,
      stateKey: `${entry.stateKey}[${i}]`, // Mark as expanded branch
      condition: simplified,
      // Keep same priority - all branches from same entry have same priority
    });

    priorBranches.push(branch);
  }

  return result;
}

/**
 * Collect top-level OR branches from a condition.
 *
 * For `A | B | C`, returns [A, B, C]
 * For `A & B`, returns [A & B] (single branch)
 * For `A | (B & C)`, returns [A, B & C]
 */
function collectOrBranches(condition: ConditionNode): ConditionNode[] {
  if (condition.kind === 'true' || condition.kind === 'false') {
    return [condition];
  }

  if (isCompoundCondition(condition) && condition.operator === 'OR') {
    // Flatten nested ORs
    const branches: ConditionNode[] = [];
    for (const child of condition.children) {
      branches.push(...collectOrBranches(child));
    }
    return branches;
  }

  // Not an OR - return as single branch
  return [condition];
}

// ============================================================================
// Post-Build OR Expansion (for De Morgan ORs)
// ============================================================================

/**
 * Expand OR conditions in exclusive entries AFTER buildExclusiveConditions.
 *
 * This handles ORs that arise from De Morgan expansion during negation:
 *   !(A & B) = !A | !B
 *
 * These ORs need to be made exclusive to avoid overlapping CSS rules:
 *   !A | !B  →  !A | (A & !B)
 *
 * This is logically equivalent but ensures each branch has proper context.
 *
 * Example:
 *   Input: { "": V1, "@supports(...) & :has()": V2 }
 *   V2's exclusive = @supports & :has
 *   V1's exclusive = !(@supports & :has) = !@supports | !:has
 *
 *   Without this fix: V1 gets two rules:
 *     - @supports (not ...) → V1  ✓
 *     - :not(:has()) → V1  ✗ (missing @supports context!)
 *
 *   With this fix: V1 gets two exclusive rules:
 *     - @supports (not ...) → V1  ✓
 *     - @supports (...) { :not(:has()) } → V1  ✓ (proper context!)
 */
export function expandExclusiveOrs(
  entries: ExclusiveStyleEntry[],
): ExclusiveStyleEntry[] {
  const result: ExclusiveStyleEntry[] = [];

  for (const entry of entries) {
    const expanded = expandExclusiveConditionOrs(entry);
    result.push(...expanded);
  }

  return result;
}

/**
 * Check if a condition involves at-rules (media, container, supports, starting)
 */
function hasAtRuleContext(node: ConditionNode): boolean {
  if (node.kind === 'true' || node.kind === 'false') {
    return false;
  }

  if (node.kind === 'state') {
    // These condition types generate at-rules
    return (
      node.type === 'media' ||
      node.type === 'container' ||
      node.type === 'supports' ||
      node.type === 'starting'
    );
  }

  if (node.kind === 'compound') {
    return node.children.some(hasAtRuleContext);
  }

  return false;
}

/**
 * Sort OR branches to prioritize at-rule conditions first.
 *
 * This is critical for correct CSS generation. For `!A | !B` where A is at-rule
 * and B is modifier, we want:
 *   - Branch 0: !A (at-rule negation - covers "no @supports/media" case)
 *   - Branch 1: A & !B (modifier negation with at-rule context)
 *
 * If we process in wrong order (!B first), we'd get:
 *   - Branch 0: !B (modifier negation WITHOUT at-rule context - WRONG!)
 *   - Branch 1: B & !A (at-rule negation with modifier - incomplete coverage)
 */
function sortOrBranchesForExpansion(
  branches: ConditionNode[],
): ConditionNode[] {
  return [...branches].sort((a, b) => {
    const aHasAtRule = hasAtRuleContext(a);
    const bHasAtRule = hasAtRuleContext(b);

    // At-rule conditions come first
    if (aHasAtRule && !bHasAtRule) return -1;
    if (!aHasAtRule && bHasAtRule) return 1;

    // Same type - keep original order (stable sort)
    return 0;
  });
}

/**
 * Expand ORs in a single entry's exclusive condition
 */
function expandExclusiveConditionOrs(
  entry: ExclusiveStyleEntry,
): ExclusiveStyleEntry[] {
  let orBranches = collectOrBranches(entry.exclusiveCondition);

  // If no OR (single branch), return as-is
  if (orBranches.length <= 1) {
    return [entry];
  }

  // Sort branches so at-rule conditions come first
  // This ensures proper context inheritance during expansion
  orBranches = sortOrBranchesForExpansion(orBranches);

  // Make each OR branch exclusive from prior branches
  const result: ExclusiveStyleEntry[] = [];
  const priorBranches: ConditionNode[] = [];

  for (let i = 0; i < orBranches.length; i++) {
    const branch = orBranches[i];

    // Build: branch & !prior[0] & !prior[1] & ...
    // This transforms: !A | !B  →  !A, !B & !!A  =  !A, (A & !B)
    let exclusiveBranch: ConditionNode = branch;
    for (const prior of priorBranches) {
      exclusiveBranch = and(exclusiveBranch, not(prior));
    }

    // Simplify to detect impossible combinations and clean up double negations
    const simplified = simplifyCondition(exclusiveBranch);

    // Skip impossible branches
    if (simplified.kind === 'false') {
      priorBranches.push(branch);
      continue;
    }

    result.push({
      ...entry,
      stateKey: `${entry.stateKey}[or:${i}]`, // Mark as expanded OR branch
      exclusiveCondition: simplified,
    });

    priorBranches.push(branch);
  }

  return result;
}
