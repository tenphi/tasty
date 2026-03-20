# Tasty Style Rendering Pipeline

This document describes the style rendering pipeline that transforms style objects into CSS rules. The pipeline ensures that each style value is applied to exactly one condition through exclusive condition building, boolean simplification, and intelligent CSS generation.

**Implementation:** [`src/pipeline/`](../src/pipeline/) — TypeScript file names below are relative to that directory.

## Overview

The pipeline takes a `Styles` object and produces an array of `CSSRule` objects ready for injection into the DOM. Entry points include `renderStylesPipeline` (full pipeline + optional class-name prefixing) and `renderStyles` (direct selector/class mode). The per-handler flow has seven main stages:

```
Input: Styles Object
         ↓
    ┌─────────────────────────────────────┐
    │  1. PARSE CONDITIONS                │
    │     parseStyleEntries + parseStateKey│
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  2. BUILD EXCLUSIVE CONDITIONS      │
    │     Negate higher-priority entries  │
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  3. EXPAND AT-RULE OR BRANCHES       │
    │     expandExclusiveOrs (when needed)│
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  4. COMPUTE STATE COMBINATIONS      │
    │     Cartesian product across styles │
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  5. CALL HANDLERS                   │
    │     Compute CSS declarations        │
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  6. MERGE BY VALUE                  │
    │     Combine rules with same output  │
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  7. MATERIALIZE CSS                 │
    │     Condition → selectors + at-rules│
    └─────────────────────────────────────┘
         ↓
    ┌─────────────────────────────────────┐
    │  runPipeline: dedupe identical rules │
    └─────────────────────────────────────┘
         ↓
Output: CSSRule[]
```

**Simplification** (`simplifyCondition` in `simplify.ts`) is not a separate numbered stage. It runs inside exclusive building, `expandExclusiveOrs` branch cleanup, combination ANDs, merge-by-value ORs, and materialization as needed.

**Post-pass:** After `processStyles` collects rules from every handler, `runPipeline` filters duplicates using a key of `selector|declarations|atRules|rootPrefix` so identical emitted rules appear once.

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
   - `@root(theme=dark)` → `RootCondition` wrapping the inner condition
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

## Stage 2: Build Exclusive Conditions

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

## Stage 3: Expand At-Rule OR Branches

**File:** `exclusive.ts` (`expandExclusiveOrs`)

### What It Does

Runs **after** `buildExclusiveConditions`. When an entry’s **exclusive** condition contains a top-level OR that mixes **at-rule** context (`media`, `container`, `supports`, `starting`) with other branches, those ORs are split into mutually exclusive branches so each branch keeps the correct at-rule wrapping (e.g. after De Morgan: `!(A & B)` → `!A | !B`).

### How It Works

1. Collect top-level OR branches of `exclusiveCondition`.
2. If there is no OR, or **no** branch involves at-rule context, the entry is unchanged (pure selector ORs are handled later via `:is()` / variant merging in materialization).
3. Otherwise, branches are sorted with `sortOrBranchesForExpansion` so at-rule-heavy branches come first, then each branch is made exclusive against prior branches: `branch & !prior[0] & !prior[1] & ...`, then simplified.
4. Impossible branches are dropped; expanded entries get a synthetic `stateKey` suffix like `[or:0]`.

### Why

Without this pass, a condition like `!(@supports & :has)` could produce one rule missing the `@supports` wrapper. Exclusive OR expansion ensures negated at-rule groups still nest modifiers correctly.

### Example (conceptual)

See the comment block in `exclusive.ts` (~195–206): a default value’s exclusive condition can become `!@supports | !:has`; expansion yields one branch under `@supports (not …)` and another under `@supports (…) { :not(:has()) }` instead of a bare `:not(:has())` rule.

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

7. **Range intersection**: For **media and container** dimension queries, impossible ranges simplify to `FALSE` (e.g. `@media(w > 400px) & @media(w < 300px)`).

8. **Container style queries**: Conflicting or redundant `@container` style conditions on the same property can be reduced (see `simplify.ts` around the container-style conflict pass).

9. **Attribute conflict detection**:
   - `[data-theme="dark"] & [data-theme="light"] = FALSE`

### Why

Simplification reduces CSS output size and catches impossible combinations early, preventing invalid CSS rules from being generated.

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

### Stages 2–3: Exclusive conditions + expand OR

Processing order (highest priority first): `hovered`, `@media(dark)`, default.

```
hovered: [data-hovered]
@media(dark) & !hovered: @media(dark) & :not([data-hovered])
!hovered & !@media(dark): :not([data-hovered]) & not @media(dark)
```

No at-rule OR expansion needed on these exclusives.

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
  --current-color-rgb: var(--highlight-color-rgb);
}
@media (prefers-color-scheme: dark) {
  .t1:not([data-hovered]) {
    color: var(--dark-color);
    --current-color: var(--dark-color);
    --current-color-rgb: var(--dark-color-rgb);
  }
}
@media (not (prefers-color-scheme: dark)) {
  .t1:not([data-hovered]) {
    color: var(--white-color);
    --current-color: var(--white-color);
    --current-color-rgb: var(--white-color-rgb);
  }
}
```

---

## Key Design Decisions

### 1. Exclusive Conditions Over CSS Specificity

Rather than relying on CSS cascade rules, we generate mutually exclusive selectors. This makes styling predictable and debuggable.

### 2. OR Handling: DNF, `:is()`, and `expandExclusiveOrs`

OR of conditions is ultimately expressed as DNF (OR of ANDs) for CSS—comma-separated selectors, multiple rules, or `:is()` / `:not()` groups. **User-authored** ORs on pure selector conditions are handled in materialization. **`expandExclusiveOrs`** is an additional, **post-exclusive** pass for ORs that appear on **exclusive** conditions and involve **at-rule** branches (often from De Morgan on `@supports` / `@media` / `@container` / `@starting`), so each branch keeps correct at-rule nesting.

### 3. Early Contradiction Detection

Impossible combinations are detected at multiple levels (simplification, variant merging) to avoid generating invalid CSS.

### 4. Aggressive Caching

Parse, simplify, condition-to-CSS, and full-pipeline results are cached independently, enabling fast re-rendering when only parts of the style object change.
