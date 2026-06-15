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
import { branchesProduceDifferentContexts } from './materialize';
import { simplifyCondition } from './simplify';
import { emitWarning } from './warnings';

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed style entry with condition
 */
interface ParsedStyleEntry {
  styleKey: string; // e.g., 'padding', 'fill'
  stateKey: string; // Original key: '', 'compact', '@media(w < 768px)'
  value: StyleValue; // The style value (before handler processing)
  condition: ConditionNode; // Parsed condition tree
  priority: number; // Order in original object (higher = higher priority)
  /**
   * When true (set by the `@fallback` state token), this entry opts out of
   * RECEIVING negation from higher-priority entries — it persists as a
   * fallback that higher-priority states layer over via the cascade. It
   * still negates lower-priority entries, so the cascade below it stays
   * mutually exclusive. See `buildExclusiveConditions`.
   */
  fallback?: boolean;
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

    // `@fallback` entries opt out of RECEIVING negation: a higher-priority
    // state cannot turn them off. They keep their own condition (TRUE for
    // the default) and persist as a cascade fallback. They are still added
    // to `priorConditions` below, so lower-priority entries are negated by
    // them and the cascade below stays mutually exclusive.
    if (!entry.fallback) {
      for (const prior of priorConditions) {
        // Skip negating "always true" (default state) - it would become "always false"
        if (prior.kind === 'true') {
          continue;
        }

        // Cheap mutual-exclusivity pre-check: if this entry's own condition
        // already contradicts `prior` (e.g. `[theme=purple]` vs a prior
        // `[theme=green] & ...`), then `prior` can never match when this entry
        // does, so `!prior` is always true here and adds nothing. Skipping it
        // avoids De Morgan'ing `prior` into a wide OR of negations that would
        // otherwise feed an exponential Cartesian product at materialization.
        //
        // This only fires when the contradiction is structurally provable via
        // `simplifyCondition` (memoized, operates on the small pairwise AND).
        // The default entry (no positive terms) is unaffected and keeps its
        // full negation chain, which `orToCSS` recombines into compact :not().
        if (
          entry.condition.kind !== 'true' &&
          simplifyCondition(and(entry.condition, prior)).kind === 'false'
        ) {
          continue;
        }

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

    // Extract the `@fallback` negation opt-out marker. It is a top-level
    // `&` atom on the key; the remaining atoms form the actual condition.
    // Done before parseCondition so `@fallback` is never mis-parsed as a
    // modifier by parseStateKey/parseAdvancedState.
    const { fallback, condition: conditionKey } = extractFallbackMarker(
      stateKey,
      styleKey,
    );

    const condition =
      conditionKey === '' ? trueCondition() : parseCondition(conditionKey);

    entries.push({
      styleKey,
      stateKey,
      value,
      condition,
      priority: index,
      ...(fallback ? { fallback: true } : {}),
    });
  });

  // Reverse so highest priority (last in object) comes first for exclusive building
  // buildExclusiveConditions expects highest priority first
  entries.reverse();

  return entries;
}

/**
 * Extract the `@fallback` negation opt-out marker from a state key.
 *
 * `@fallback` must appear as a top-level `&` atom (not inside `|`/`^`).
 * Returns `fallback: true` and the remaining condition key (atoms minus
 * `@fallback`, rejoined with ` & `; empty string for the default state).
 *
 * If `@fallback` appears inside an OR/XOR (so `splitTopLevelAnd` returns
 * `null`) but is present in the key, a dev warning is emitted and the
 * marker is ignored (the key is parsed as-is).
 */
function extractFallbackMarker(
  stateKey: string,
  styleKey: string,
): { fallback: boolean; condition: string } {
  if (stateKey === '' || !stateKey.includes('@fallback')) {
    return { fallback: false, condition: stateKey };
  }

  const atoms = splitTopLevelAnd(stateKey);

  // Key contains `|`, `^`, or `,` at top level — `@fallback` is not a
  // valid top-level AND atom here. Warn and treat the key verbatim.
  if (atoms === null) {
    emitWarning(
      'INVALID_FALLBACK_MARKER',
      `Style key "${stateKey}" (in "${styleKey}") uses @fallback inside an OR/XOR group. ` +
        `@fallback must be a top-level "&" atom (e.g. "@fallback" or "@fallback & hovered"). ` +
        `The marker has been ignored.`,
    );
    return { fallback: false, condition: stateKey };
  }

  const rest = atoms.filter((a) => a !== '@fallback');
  if (rest.length === atoms.length) {
    // Contains the substring "@fallback" but not as a standalone atom
    // (e.g. a user state name like "@fallbackish"); leave it untouched.
    return { fallback: false, condition: stateKey };
  }

  return { fallback: true, condition: rest.join(' & ') };
}

/**
 * Merge parsed entries that share the same value.
 *
 * When multiple **non-default** state keys map to the same value, their
 * conditions can be combined with OR and treated as a single entry.
 * This must happen **before** exclusive expansion and OR branch splitting
 * to avoid combinatorial explosion and duplicate CSS output.
 *
 * **Merging must preserve the authored cascade.** Merging two same-value
 * entries with priorities `p_h > p_l` lifts the lower-priority entry up
 * to `p_h` and changes the "blocker" for intermediate-priority entries
 * from `!C_h` to `!(C_h | C_l) = !C_h & !C_l`. The added `!C_l`
 * constraint can incorrectly block an intermediate entry that should
 * have won.
 *
 * Two same-value entries with conditions `C_h` (higher priority) and
 * `C_l` (lower priority) are safe to merge iff for every entry
 * `e_m` strictly between them in priority with a different value,
 *
 *     simplify(C_m & C_l & !C_h) = FALSE
 *
 * i.e. there is no scenario where the intermediate state could have
 * matched (`C_m`), the lower-priority same-value entry would also have
 * matched (`C_l`), and the higher-priority entry would not (`!C_h`).
 * In such scenarios the intermediate is supposed to win; the merge
 * would block it by introducing `!C_l`.
 *
 * Example (UNSAFE — must not merge):
 * `{ hovered: 'red', pressed: 'blue', disabled: 'red' }`.
 * C_h = disabled, C_l = hovered, C_m = pressed. `pressed & hovered &
 * !disabled` is satisfiable (three independent modifiers), so the
 * intermediate `pressed` would lose to a merged red rule when both
 * `pressed` and `hovered` are active — breaking the cascade
 * `disabled > pressed > hovered`.
 *
 * Example (SAFE — still merges):
 * `{ '': light, '@dark': dark, '@hc': hc, '@dark & @hc': dark }`.
 * C_h = `@dark & @hc`, C_l = `@dark`, C_m = `@hc`.
 * `@hc & @dark & !(@dark & @hc) = @hc & @dark & (!@dark | !@hc)`
 * simplifies to FALSE, so merging the two darks into one `@dark` rule
 * at the higher priority does not affect the `@hc` rule.
 *
 * Default (TRUE) entries are never merged with non-default entries.
 * Merging `TRUE | X` collapses to `TRUE`, destroying the non-default
 * condition's participation in exclusive building. Stage 6
 * `mergeByValue` handles combining rules with identical CSS output
 * after exclusive conditions are correctly built.
 *
 * The merged entry keeps the highest priority of the merged entries.
 */
export function mergeEntriesByValue(
  entries: ParsedStyleEntry[],
): ParsedStyleEntry[] {
  if (entries.length <= 1) return entries;

  const merged: ParsedStyleEntry[] = [];

  for (const entry of entries) {
    // Defaults are never merged with non-defaults.
    // `@fallback` entries are never merged either: merging would lift their
    // condition and rewrite the negation cascade, destroying the opt-out
    // semantics. They participate in Stage 6 `mergeByValue` later instead.
    if (entry.condition.kind === 'true' || entry.fallback) {
      merged.push(entry);
      continue;
    }

    const valueKey = serializeValue(entry.value);
    let mergeIdx = -1;

    // Find the most recent merged entry with the same value such that
    // merging is provably safe with respect to every different-value
    // entry strictly between them in priority order.
    for (let j = merged.length - 1; j >= 0; j--) {
      const prev = merged[j];
      if (prev.condition.kind === 'true') continue;
      // Never merge into a `@fallback` entry — it must keep its opt-out flag.
      if (prev.fallback) continue;
      if (serializeValue(prev.value) !== valueKey) continue;

      let safe = true;
      for (let k = j + 1; k < merged.length; k++) {
        const inter = merged[k];
        if (inter.condition.kind === 'true') continue;
        if (serializeValue(inter.value) === valueKey) continue;

        // Safety: simplify(C_m & C_l & !C_h) must be FALSE.
        // C_h = prev.condition, C_l = entry.condition, C_m = inter.condition.
        const conflict = simplifyCondition(
          and(inter.condition, entry.condition, not(prev.condition)),
        );
        if (conflict.kind !== 'false') {
          safe = false;
          break;
        }
      }

      if (safe) {
        mergeIdx = j;
        break;
      }
    }

    if (mergeIdx >= 0) {
      const prev = merged[mergeIdx];
      const newCondition = simplifyCondition(
        or(prev.condition, entry.condition),
      );
      // `prev` was processed before `entry`, so its priority is always
      // greater or equal. Keep `Math.max` for clarity of intent.
      merged[mergeIdx] = {
        styleKey: prev.styleKey,
        stateKey: `${prev.stateKey} | ${entry.stateKey}`,
        value: prev.value,
        condition: newCondition,
        priority: Math.max(prev.priority, entry.priority),
      };
    } else {
      merged.push(entry);
    }
  }

  // `merged` is already highest-priority-first by construction: input
  // entries arrive in that order, merges update an entry in place
  // without changing its priority, and no insert/delete reorders the
  // array.
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
    // Keys carrying a top-level `@fallback` marker must stay opaque so the
    // marker is never dropped as a "redundant atom" or collapsed into
    // another key. (`@fallback` is extracted later in parseStyleEntries.)
    const isOpaque = atoms === null || atoms.includes('@fallback');
    return {
      // null means the key has non-AND operators; treat the whole key
      // as a single opaque atom so it never matches partial pairs.
      atoms: isOpaque ? [key] : (atoms as string[]),
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
 *
 * Skip optimisation: when every branch renders into the same at-rule /
 * root / parent / own context (see "Key Design Decision #2" in
 * `docs/pipeline.md`), forcing mutual exclusivity here produces dead
 * `B & !A`-style branches that materialization later folds back into
 * `:is(A, B)`. Bail out and let `materialize.ts` collapse the OR via
 * `mergeVariantsIntoSelectorGroups`. Cross-entry exclusivity is still
 * enforced by `buildExclusiveConditions`; the post-build `expandExclusiveOrs`
 * pass still handles De Morgan ORs whose branches actually differ in
 * context.
 */
function expandSingleEntry(entry: ParsedStyleEntry): ParsedStyleEntry[] {
  const orBranches = collectOrBranches(entry.condition);

  // If no OR (single branch), return as-is
  if (orBranches.length <= 1) {
    return [entry];
  }

  // Skip OR expansion when all branches share the same at-rule context.
  // Pure-selector ORs (e.g. `:hover | :focus`,
  // `:-webkit-autofill | :autofill`) are better merged into `:is(...)` at
  // materialization than expanded into mutually-exclusive cascades.
  if (!branchesProduceDifferentContexts(orBranches)) {
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
 * Check if a condition involves an `@supports` query.
 *
 * `@supports` is feature detection: anything ANDed with it (e.g. a
 * `@container scroll-state(...)` query that only exists when
 * `container-type: scroll-state` is supported) becomes *unknown* — not
 * simply false — when the feature is absent. So a negated supports branch
 * must be emitted first (as the bare "feature unsupported" fallback) and
 * every other negated branch must nest inside the supported scope.
 */
function hasSupportsContext(node: ConditionNode): boolean {
  if (node.kind === 'state') {
    return node.type === 'supports';
  }

  if (node.kind === 'compound') {
    return node.children.some(hasSupportsContext);
  }

  return false;
}

/**
 * Rank an OR branch for exclusive expansion ordering. Lower rank is
 * processed first (becomes the more "outer" / less-constrained branch):
 *   0 — branch involves `@supports` (feature-detection guard)
 *   1 — branch involves another at-rule (media / container / starting)
 *   2 — branch is pure selector context (modifiers / pseudos)
 */
function orBranchRank(node: ConditionNode): 0 | 1 | 2 {
  if (hasSupportsContext(node)) return 0;
  if (hasAtRuleContext(node)) return 1;
  return 2;
}

/**
 * Sort OR branches to prioritize at-rule conditions first, with
 * `@supports` branches ahead of all other at-rules.
 *
 * This is critical for correct CSS generation. For `!A | !B` where A is at-rule
 * and B is modifier, we want:
 *   - Branch 0: !A (at-rule negation - covers "no @supports/media" case)
 *   - Branch 1: A & !B (modifier negation with at-rule context)
 *
 * If we process in wrong order (!B first), we'd get:
 *   - Branch 0: !B (modifier negation WITHOUT at-rule context - WRONG!)
 *   - Branch 1: B & !A (at-rule negation with modifier - incomplete coverage)
 *
 * The extra `@supports`-first tier matters when a feature query guards a
 * dependent query. For `!(S & C) = !S | !C` (S = `@supports(...)`, C =
 * `@container scroll-state(...)`), `simplify` sorts the branches
 * alphabetically into `[!C, !S]`. Expanding in that order would emit `!C`
 * as a bare `@container (not scroll-state(...))` — meaningless where the
 * feature is unsupported, so the default would never apply there. Putting
 * `!S` first yields `!S | (S & !C)`: a bare supports fallback plus the
 * dependent negation nested in the supported scope.
 */
function sortOrBranchesForExpansion(
  branches: ConditionNode[],
): ConditionNode[] {
  return [...branches].sort((a, b) => orBranchRank(a) - orBranchRank(b));
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

  // Skip OR expansion when all branches share the same at-rule context.
  // De Morgan ORs across different at-rule scopes (e.g.
  // `!@supports | !:has`) still need exclusive splitting so each branch
  // ends up in the correct at-rule wrapper, but pure-selector ORs
  // (`:hover | :focus`, `:-webkit-autofill | :autofill`) collapse
  // cleanly via `:is(...)` at materialization. Matches the same
  // heuristic used by `makeOrBranchesExclusive` in `materialize.ts` and
  // by Stage 2a above.
  if (!branchesProduceDifferentContexts(orBranches)) {
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
