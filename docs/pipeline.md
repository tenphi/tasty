# Tasty Style Rendering Pipeline

This document describes the style rendering pipeline that transforms style objects into CSS rules. The pipeline ensures that each style value is applied to exactly one condition through exclusive condition building, boolean simplification, and intelligent CSS generation.

**Implementation:** [`src/pipeline/`](../src/pipeline/) — TypeScript file names below are relative to that directory.

## Overview

The pipeline takes a `Styles` object and produces an array of `CSSRule` objects ready for injection into the DOM. Entry points include `renderStylesPipeline` (full pipeline + optional class-name prefixing) and `renderStyles` (direct selector/class mode). The per-handler flow is:

```
Input: Styles Object
         ↓
    ┌──────────────────────────────────────────┐
    │  0. PRE-PARSE NORMALIZATION              │
    │     extractCompoundStates                │
    │     (drop don't-care AND atoms)          │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  1. PARSE CONDITIONS                     │
    │     parseStyleEntries + parseStateKey    │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  1b. MERGE ENTRIES BY VALUE              │
    │     mergeEntriesByValue                  │
    │     (collapse same-value non-defaults)   │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  2a. EXPAND USER OR BRANCHES             │
    │     expandOrConditions                   │
    │     (A | B | C → A, B&!A, C&!A&!B)       │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  2b. BUILD EXCLUSIVE CONDITIONS          │
    │     Negate higher-priority entries       │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  3. EXPAND DE MORGAN OR BRANCHES         │
    │     expandExclusiveOrs                   │
    │     (only for at-rule ORs from negation) │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  4. COMPUTE STATE COMBINATIONS           │
    │     Cartesian product across styles      │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  5. CALL HANDLERS                        │
    │     Compute CSS declarations             │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  6. MERGE BY VALUE                       │
    │     Combine rules with same output       │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  7. MATERIALIZE CSS                      │
    │     Condition → selectors + at-rules     │
    └──────────────────────────────────────────┘
         ↓
    ┌──────────────────────────────────────────┐
    │  runPipeline post-pass:                  │
    │  - dedupe identical rules                │
    │  - emit @starting-style rules last       │
    └──────────────────────────────────────────┘
         ↓
Output: CSSRule[]
```

**Simplification** (`simplifyCondition` in `simplify.ts`) is not a separate numbered stage. It runs inside OR expansion, exclusive building, `expandExclusiveOrs` branch cleanup, combination ANDs, merge-by-value ORs, and materialization. Every call is cached by condition unique-id, so the repetition is cheap.

**Post-pass:** After `processStyles` collects rules from every handler, `runPipeline` (`index.ts:188`) filters duplicates using a key of `selector|declarations|atRules|rootPrefix|startingStyle` and then reorders rules so every `@starting-style` rule is emitted **after** all normal rules. This ordering is cascade-critical: `@starting-style` rules share specificity with their normal counterparts, and source order decides which value wins.

---

## Stage 0: Pre-parse Normalization

**File:** `exclusive.ts` (`extractCompoundStates`)

### What It Does

Runs on each style's value map **before** any parsing. If a compound AND state key shares a value with the "atom absent" variant, the atom is a don't-care and every key is simplified by dropping it. Duplicate keys collapse.

### How It Works

1. Gather the unique set of top-level AND atoms across all keys.
2. An atom is **redundant** when every entry that contains it has a same-value partner with the atom absent and the rest of the atoms identical.
3. Keys containing `|`, `^`, or `,` at top level are treated as opaque single atoms (they don't participate in atom-level extraction).
4. Drop redundant atoms from every key; collapse duplicates.

### Why

Removing don't-care dimensions before parsing prevents combinatorial blowup in later stages. `mergeEntriesByValue`, `buildExclusiveConditions`, and materialization all see fewer entries and fewer spurious conditions. Implemented as part of the Apr 2026 fix for overlapping CSS rules (commit 7cd9dbe).

### Example

```typescript
// Input (value map)
{ '': 'A', '@dark': 'B', '@hc': 'A', '@dark & @hc': 'B' }
// @hc is a don't-care: its presence never changes the value.

// Output
{ '': 'A', '@dark': 'B' }
```

---

## Stage 1: Parse Conditions

**Files:** `exclusive.ts` (`parseStyleEntries`), `parseStateKey.ts` (`parseStateKey`)

### What It Does

Converts each state key in a style value map (like `'hovered & !disabled'`, `'@media(w < 768px)'`) into `ConditionNode` trees. `parseStyleEntries` walks the object keys in source order and assigns priorities; `parseStateKey` parses a single key string.

### How It Works

1. **Tokenization**: The state key is split into tokens using a regex pattern that recognizes:
   - Operators: `&` (AND), `|` (OR), `!` (NOT), `^` (XOR)
   - Parentheses for grouping
   - State tokens: `@media(...)`, `@root(...)`, `@parent(...)`, `@own(...)`, `@supports(...)`, `@(...)`, `@starting`, predefined states, modifiers, pseudo-classes

2. **Recursive Descent Parsing**: Tokens are parsed with operator precedence:
   ```
   ! (NOT) > ^ (XOR) > | (OR) > & (AND)
   ```

3. **State Token Interpretation**: Each state token is converted to a specific condition type:
   - `hovered` → `ModifierCondition` with `attribute: 'data-hovered'`
   - `theme=dark` → `ModifierCondition` with `attribute: 'data-theme', value: 'dark'`
   - `:hover` → `PseudoCondition`
   - `@media(w < 768px)` → `MediaCondition` (`subtype: 'dimension'`) with bounds
   - `@media(prefers-color-scheme: dark)` → `MediaCondition` (`subtype: 'feature'`, `feature` + `featureValue`)
   - `@root(schema=dark)` → `RootCondition` wrapping the inner condition
   - `@parent(hovered)` → `ParentCondition` (optional `direct` for immediate parent)
   - `@own(hovered)` → `OwnCondition` wrapping the parsed inner condition
   - `@supports(display: grid)` → `SupportsCondition`
   - `@(w < 600px)` → `ContainerCondition` (dimension, style, or raw subtypes)
   - `@mobile` → Resolved via predefined states, then parsed recursively

Pipeline warnings for invalid inputs (e.g. bad `$` selector affix) are emitted from `warnings.ts`.

### Why

The condition tree representation enables:
- Boolean algebra operations (simplification, negation)
- Semantic analysis (detect contradictions)
- Flexible CSS generation (different output for media vs. selectors)

### Example

```typescript
// Input
'hovered & @media(w < 768px)'

// Output ConditionNode
{
  kind: 'compound',
  operator: 'AND',
  children: [
    { kind: 'state', type: 'modifier', attribute: 'data-hovered', ... },
    { kind: 'state', type: 'media', subtype: 'dimension', upperBound: { value: '768px', ... }, ... }
  ]
}
```

---

## Stage 1b: Merge Entries By Value

**File:** `exclusive.ts` (`mergeEntriesByValue`)

### What It Does

Collapses parsed entries that share the same value. Only **non-default** entries are merged — an entry with the default state (`''` → `TrueCondition`) is never merged with a non-default entry.

### How It Works

1. Group entries by serialized value.
2. Within each group, split out default (TRUE) entries.
3. Keep default entries as-is; they must retain TRUE so they participate correctly in exclusive building.
4. Combine non-default entries into a single entry with condition `OR(e1.condition, e2.condition, …)`, simplified via `simplifyCondition`. The merged entry keeps the **highest** priority in the group.
5. Re-sort by priority (highest first).

### Why

Without this, a value map like `{ '@dark': 'red', '@dark & @hc': 'red' }` would create two separate entries that later produce two CSS rules with identical output. Merging before exclusive building keeps the exclusive condition algebra small and avoids duplicate CSS.

**Why defaults are kept separate:** merging `TRUE | X` collapses to `TRUE`, destroying X's participation in the exclusive cascade. Intermediate-priority states would then lose their `:not(X)` negation, producing overlapping CSS rules. See `exclusive.ts:140-160` for the rationale.

### Example

```typescript
// Input entries (highest priority first)
[
  { stateKey: '@dark & @hc', value: 'red', condition: dark & hc },
  { stateKey: '@dark',       value: 'red', condition: dark     },
]

// Output: one merged entry
[
  { stateKey: '@dark & @hc | @dark', value: 'red',
    condition: simplify((dark & hc) | dark) = dark }
]
```

---

## Stage 2a: Expand User OR Branches

**File:** `exclusive.ts` (`expandOrConditions`)

### What It Does

Runs **before** `buildExclusiveConditions`. Splits any user-authored OR in a parsed entry's condition into multiple sibling entries, each made exclusive against the OR branches that come before it.

### How It Works

For an entry with condition `A | B | C`:

```
A            (first branch, no prior)
B & !A       (second branch exclusive from first)
C & !A & !B  (third branch exclusive from first two)
```

Each expanded branch gets a `stateKey` suffix like `[0]`, `[1]`, `[2]`. Branches that simplify to `FALSE` are dropped. Branches inherit the original entry's priority.

This pass does **not** sort branches — user ORs are authored in the natural order they appear and aren't the product of De Morgan negation, so at-rule-aware sorting isn't required here (that's Stage 3's job).

### Why

Running this before exclusive building means the Stage 2b negation cascade sees one branch per entry and never has to reason about nested ORs while computing `!prior`. It also avoids emitting overlapping CSS rules: `{ 'compact | @media(dark)': 'red' }` becomes two mutually exclusive entries rather than one rule whose two branches could both match simultaneously.

---

## Stage 2b: Build Exclusive Conditions

**File:** `exclusive.ts` (`buildExclusiveConditions`)

### What It Does

Ensures each style entry applies in exactly one scenario by ANDing each condition with the negation of all higher-priority conditions.

### How It Works

Given entries ordered by priority (highest first):
```
A: value1 (priority 2)
B: value2 (priority 1)
C: value3 (priority 0)
```

Produces:
```
A: A                    (highest priority, no negation needed)
B: B & !A               (applies only when A doesn't)
C: C & !A & !B          (applies only when neither A nor B)
```

Each exclusive condition is passed through `simplifyCondition`. Entries that simplify to `FALSE` (impossible) are filtered out. The default state (`''` → `TrueCondition`) is not added to the “prior” list for negation (see `buildExclusiveConditions`).

### Why

This eliminates CSS specificity wars. Instead of relying on cascade order, each CSS rule matches in exactly one scenario. Benefits:
- Predictable styling regardless of rule order
- No conflicts from overlapping conditions
- Easier debugging (each rule is mutually exclusive)

### Example

```typescript
// Style value mapping
{ padding: { '': '2x', 'compact': '1x', '@media(w < 768px)': '0.5x' } }

// After exclusive building (highest priority first):
// @media(w < 768px): applies when media matches
// compact & !@media(w < 768px): applies when compact but NOT media
// !compact & !@media(w < 768px): default, applies when neither
```

---

## Stage 3: Expand De Morgan OR Branches

**File:** `exclusive.ts` (`expandExclusiveOrs`, `sortOrBranchesForExpansion`)

### What It Does

Runs **after** `buildExclusiveConditions`. Handles ORs that arise **during** exclusive building from De Morgan negation — e.g. when a higher-priority condition `A & B` gets negated into the next entry's exclusive as `!(A & B) = !A | !B`. When such an OR mixes **at-rule** context (`media`, `container`, `supports`, `starting`) with other branches, each branch needs to keep its own at-rule wrapping.

This is the companion to **Stage 2a** (user-OR expansion). The split exists because the two passes have different data and different correctness needs:

| Stage | Runs on | Sees ORs from | Sorts branches? |
|---|---|---|---|
| 2a `expandOrConditions` | `ParsedStyleEntry.condition` | User-authored `|` in state keys | No — user order is stable |
| 3 `expandExclusiveOrs` | `ExclusiveStyleEntry.exclusiveCondition` | De Morgan negation inside `buildExclusiveConditions` | Yes — at-rule branches first |

### How It Works

1. Collect top-level OR branches of `exclusiveCondition`.
2. If there is no OR (single branch), the entry is unchanged. Pure selector ORs with no at-rule context are also left alone (materialization handles them via `:is()` / variant merging).
3. Otherwise `sortOrBranchesForExpansion` reorders branches so at-rule-heavy branches come first. This is load-bearing for correctness (see below).
4. Each branch is made exclusive against prior branches: `branch & !prior[0] & !prior[1] & ...`, then simplified.
5. Impossible branches are dropped; expanded entries get a synthetic `stateKey` suffix like `[or:0]`.

### Why the sort matters

Consider `!A | !B` where A is an at-rule (e.g. `@supports(grid)`) and B is a modifier (e.g. `:has(foo)`):

- **With at-rule-first sort** (`!A`, then `!B & A`): the first branch emits "outside `@supports`", the second emits "inside `@supports` with `:not(:has(foo))`". Full coverage.
- **Without the sort** (`!B`, then `!A & B`): the first branch emits `:not(:has(foo))` as a bare selector with no at-rule context — leaking the rule outside `@supports`. The second is incomplete.

The pre-build Stage 2a pass doesn't need this because user-authored ORs aren't produced by negation and their branches are expected to apply in each branch's own scope.

### Example (conceptual)

See the comment block in `exclusive.ts:500-523`: a default value whose higher-priority sibling is `@supports(...) & :has(...)` gets an exclusive of `!@supports | !:has`. Expansion yields one branch under `@supports (not ...)` and another under `@supports (...) { :not(:has()) }` instead of a bare `:not(:has())` rule.

---

## Stage 4: Compute State Combinations

**File:** `index.ts` (`computeStateCombinations`)

### What It Does

Computes the Cartesian product of all style entries for a handler, creating snapshots of which value each style has for each possible state combination.

### How It Works

1. Collect exclusive entries for each style the handler uses
2. Compute Cartesian product: every combination of entries
3. For each combination:
   - AND all `exclusiveCondition` values together
   - `simplifyCondition` the result
   - Skip if simplified to `FALSE`
   - Record the values for each style

### Why

Style handlers often depend on multiple style properties (e.g., `padding` might look at both `padding` and `gap`). By computing all valid combinations, we can call the handler once per unique state and get the correct CSS output.

### Example

```typescript
// Handler looks up: ['padding', 'size']
// padding has entries: [{ value: '2x', condition: A }, { value: '1x', condition: B }]
// size has entries: [{ value: 'large', condition: C }, { value: 'small', condition: D }]

// Combinations:
// { padding: '2x', size: 'large', condition: A & C }
// { padding: '2x', size: 'small', condition: A & D }
// { padding: '1x', size: 'large', condition: B & C }
// { padding: '1x', size: 'small', condition: B & D }
```

---

## Stage 5: Call Handlers

**File:** `index.ts` (within `processStyles`)

### What It Does

Invokes style handlers with computed value snapshots to produce CSS declarations.

### How It Works

1. For each state snapshot (condition + values):
   - Call the handler with the values
   - Handler returns CSS properties (e.g., `{ 'padding-top': '16px', 'padding-bottom': '16px' }`)
   - Handler may also return `$` (selector suffix) for pseudo-elements
2. Create computed rules with the condition, declarations, and selector suffix

### Why

Style handlers encapsulate the logic for translating design tokens (like `'2x'`) to actual CSS values (like `'16px'`). They can also handle complex multi-property styles (e.g., `padding` → `padding-top`, `padding-right`, etc.).

---

## Stage 6: Merge By Value

**File:** `index.ts` (`mergeByValue`)

### What It Does

Combines rules that have identical CSS output into a single rule with an OR condition.

### How It Works

1. Group rules by `selectorSuffix` plus a stable string for declarations (JSON via an internal `declStringCache` `WeakMap` on declaration objects)
2. For rules in the same group:
   - Merge their conditions with OR
   - `simplifyCondition` the resulting condition
3. Output one rule per group

### Why

Different state combinations might produce the same CSS output. Rather than emitting duplicate CSS, we combine them into a single rule. This reduces CSS size and improves performance.

### Example

```typescript
// Before merging:
// condition: A → { color: 'red' }
// condition: B → { color: 'red' }

// After merging:
// condition: A | B → { color: 'red' }
```

---

## Stage 7: Materialize CSS

**File:** `materialize.ts` (`conditionToCSS`, `materializeComputedRule` in `index.ts`)

### What It Does

Converts condition trees into actual CSS selectors and at-rules.

### How It Works

1. **Condition to CSS components** (`conditionToCSS`): Walk the condition tree and build `SelectorVariant` data:
   - `ModifierCondition` → attribute selectors (e.g. `[data-hovered]`); optional `operator` (`=`, `^=`, `$=`, `*=`)
   - `PseudoCondition` → pseudo-class (e.g. `:hover`)
   - `MediaCondition` → `@media` (dimension, feature, or type)
   - `ContainerCondition` → `@container` (dimension, style query, or raw)
   - `RootCondition` → `rootGroups` / root prefix fragments
   - `ParentCondition` → `parentGroups` / ancestor selectors (`direct` → child combinator path)
   - `OwnCondition` → `ownGroups` on the **styled** element (sub-element / `&` scope), optimized with `optimizeGroups`
   - `SupportsCondition` → `@supports` at-rules
   - `StartingCondition` → `@starting-style` wrapper

2. **AND / OR on variants**: AND merges variant dimensions; OR yields multiple variants (later merged into `:is()` / `:not()` groups where appropriate).

3. **Contradiction detection**: During variant merging, impossible combinations are dropped (e.g. conflicting media, root, or modifier negations).

4. **`materializeComputedRule`**: Groups variants by sorted at-rules plus root-prefix key; within each group, `mergeVariantsIntoSelectorGroups` merges variants that differ only in flat modifier/pseudo parts; builds selector strings and emits one or more `CSSRule` objects.

### Why

CSS has different mechanisms for different condition types:
- Modifiers → attribute selectors
- Media queries → `@media` blocks
- Container queries → `@container` blocks
- Root state → `:root` / root groups
- Supports → `@supports` blocks

The materialization layer handles these differences while maintaining the logical semantics of the condition tree.

### Output Structure

```typescript
interface CSSRule {
  selector: string | string[]; // Selector fragment(s); array when OR’d selector branches
  declarations: string; // CSS declarations (e.g. 'color: red;')
  atRules?: string[]; // Wrapping at-rules
  rootPrefix?: string; // Root state prefix
}
```

When `renderStylesPipeline` runs **without** a class name, returned rules include `needsClassName: true` (compatibility field for the injector); that flag is not part of `CSSRule` inside `materialize.ts`.

---

## Condition Types

**File:** `conditions.ts`

### ConditionNode Hierarchy

```
ConditionNode
├── TrueCondition     (matches everything)
├── FalseCondition    (matches nothing)
├── CompoundCondition (AND/OR of children)
└── StateCondition
    ├── ModifierCondition    (data attributes; optional value + match operator)
    ├── PseudoCondition      (CSS pseudo-classes: :hover)
    ├── MediaCondition       (subtype: dimension | feature | type)
    ├── ContainerCondition   (subtype: dimension | style | raw)
    ├── RootCondition        (inner condition under :root)
    ├── ParentCondition      (@parent(...); optional direct parent)
    ├── OwnCondition         (@own(...); scoped to styled / sub-element)
    ├── SupportsCondition    (@supports(...))
    └── StartingCondition    (@starting-style wrapper)
```

### Key Operations

- `and(...conditions)`: Create AND with short-circuit and flattening
- `or(...conditions)`: Create OR with short-circuit and flattening
- `not(condition)`: Negate with De Morgan's law support
- `getConditionUniqueId(condition)`: Get canonical ID for comparison

---

## Simplification

**File:** `simplify.ts`

### What It Does

Applies boolean algebra rules to reduce condition complexity and detect impossible combinations.

### Rules Applied

1. **Identity Laws**:
   - `A & TRUE = A`
   - `A | FALSE = A`

2. **Annihilator Laws**:
   - `A & FALSE = FALSE`
   - `A | TRUE = TRUE`

3. **Contradiction Detection**:
   - `A & !A = FALSE`

4. **Tautology Detection**:
   - `A | !A = TRUE`

5. **Idempotent Laws** (via deduplication):
   - `A & A = A`
   - `A | A = A`

6. **Absorption Laws**:
   - `A & (A | B) = A`
   - `A | (A & B) = A`

7. **Range intersection**: For **media and container** dimension queries, impossible ranges simplify to `FALSE` (e.g. `@media(w > 400px) & @media(w < 300px)`). Ranges with compatible bounds are also merged in place (`w >= 400 & w <= 800` → a single bounded range).

8. **Container style queries**: Conflicting or redundant `@container` style conditions on the same property can be reduced (see `simplify.ts` around the container-style conflict pass).

9. **Attribute conflict detection**:
   - `[data-theme="dark"] & [data-theme="light"] = FALSE`

10. **Complementary factoring** (OR context): `(A & B) | (A & !B) = A`. Also works on **compound complements** — if two AND-clauses differ only by a child that is a compound negation of the other (e.g. `X` vs `!X` where X is itself `(P & Q)`), the clauses factor correctly.

11. **Consensus / resolution** (AND context, dual of #10): `(A | B) & (A | !B) = A`. Added in commit f9038bd to eliminate overlapping CSS selectors from compound-state OR branches.

### Why

Simplification reduces CSS output size and catches impossible combinations early, preventing invalid CSS rules from being generated. Every `simplifyCondition` call is memoized by the condition's unique id, so the cost of running it many times across stages is negligible after the first hit.

---

## Caching Strategy

LRU and small auxiliary caches:

| Cache | Size | Key | Purpose |
|-------|------|-----|---------|
| `pipelineCache` | 5000 | `pipelineCacheKey \|\| stringifyStyles(styles)` | Skip full pipeline for identical styles |
| `parseCache` | 5000 | `trimmedStateKey + '\\0' + isSubElement + '\\0' + JSON.stringify(localPredefinedStates)` | Skip re-parsing identical state keys in context |
| `simplifyCache` | 5000 | `getConditionUniqueId(node)` | Skip re-simplifying identical conditions |
| `conditionCache` | 3000 | `getConditionUniqueId(node)` in `conditionToCSS` | Skip re-materializing identical conditions |
| `variantKeyCache` | — | `WeakMap<SelectorVariant, string>` | Stable string keys for variants during materialization |
| `declStringCache` | — | `WeakMap<Record<string,string>, string>` | Stable JSON keys for declaration objects in `mergeByValue` |

---

## Example Walkthrough

### Input

```typescript
const styles = {
  color: {
    '': '#white',
    '@media(prefers-color-scheme: dark)': '#dark',
    hovered: '#highlight',
  },
};
```

### Stage 1: Parse Conditions

```
'' → TrueCondition
'@media(prefers-color-scheme: dark)' → MediaCondition(subtype: 'feature', feature: 'prefers-color-scheme', featureValue: 'dark')
'hovered' → ModifierCondition(attribute: 'data-hovered')
```

### Stage 0 + 1b: Normalization

No compound AND keys, no same-value duplicates — the value map is unchanged.

### Stage 1 + 2a: Parse and expand user ORs

No user ORs — three entries pass through unchanged.

### Stage 2b + 3: Exclusive conditions + De Morgan expansion

Processing order (highest priority first): `hovered`, `@media(dark)`, default.

```
hovered: [data-hovered]
@media(dark) & !hovered: @media(dark) & :not([data-hovered])
!hovered & !@media(dark): :not([data-hovered]) & not @media(dark)
```

The default entry's exclusive is `!hovered & !@media(dark)` — no top-level OR, so Stage 3 expansion does nothing. If a higher-priority entry had been `@media(dark) & :has(foo)`, the default's exclusive would have expanded via De Morgan into two at-rule-aware branches (see Stage 3 for that scenario).

### Stages 4–5: Compute combinations and call handler

Single style, three snapshots; the `color` handler emits `color` plus `--current-color*` variables.

### Stage 6: Merge by value

Each snapshot yields distinct declarations; no merge.

### Stage 7: Materialize CSS

Using `renderStyles(styles, '.t1')` (single class prefix; `renderStylesPipeline` doubles the class for specificity when a class name is supplied):

```css
.t1[data-hovered] {
  color: var(--highlight-color);
  --current-color: var(--highlight-color);
  --current-color-oklch: var(--highlight-color-oklch);
}
@media (prefers-color-scheme: dark) {
  .t1:not([data-hovered]) {
    color: var(--dark-color);
    --current-color: var(--dark-color);
    --current-color-oklch: var(--dark-color-oklch);
  }
}
@media (not (prefers-color-scheme: dark)) {
  .t1:not([data-hovered]) {
    color: var(--white-color);
    --current-color: var(--white-color);
    --current-color-oklch: var(--white-color-oklch);
  }
}
```

---

## Key Design Decisions

### 1. Exclusive Conditions Over CSS Specificity

Rather than relying on CSS cascade rules, we generate mutually exclusive selectors. This makes styling predictable and debuggable.

### 2. OR Handling in Three Layers

Boolean OR appears in three different shapes during the pipeline, and each is handled where it's cheapest to get right:

1. **User-authored ORs in state keys** (Stage 2a, `expandOrConditions`): A user-authored condition like `'compact | @media(w < 768px)'` is split into multiple exclusive entries **before** exclusive building so the negation cascade doesn't have to reason about nested ORs.

2. **De Morgan ORs from negation** (Stage 3, `expandExclusiveOrs`): When `buildExclusiveConditions` negates a higher-priority compound like `A & B`, the result is `!A | !B`. If branches involve at-rules, they're split with `sortOrBranchesForExpansion` so at-rule context is preserved per branch.

3. **Pure selector ORs** (materialization): ORs that only mention modifiers/pseudos are kept intact until the `conditionToCSS` layer, where they're merged into `:is()` / `:not()` groups or emitted as comma-separated selectors. There's no gain from expanding these earlier — CSS already has compact syntax for selector-only disjunction.

Ultimately every emitted CSS rule corresponds to one conjunctive clause (DNF), produced by whichever of the three paths handled the OR.

### 3. Early Contradiction Detection

Impossible combinations are detected at multiple levels (simplification, variant merging) to avoid generating invalid CSS.

### 4. Aggressive Caching

Parse, simplify, condition-to-CSS, and full-pipeline results are cached independently, enabling fast re-rendering when only parts of the style object change.
