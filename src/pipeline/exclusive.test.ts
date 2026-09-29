/**
 * Priority guarantees of the pre-materialization stages (0–3).
 *
 * Every stage before CSS materialization rewrites a state map, and each must
 * leave its resolution unchanged: in any state, the last authored key that
 * holds wins (see `src/test/state-oracle.ts`). These tests check that
 * directly, on thousands of generated maps, by evaluating each stage's
 * conditions against the oracle — no CSS involved, so they run in Node and
 * point at the stage that broke. `state-priority.test.ts` checks the same
 * rule end to end in a browser.
 */
import type { ConditionNode } from './conditions';
import {
  buildExclusiveConditions,
  expandExclusiveOrs,
  expandOrConditions,
  extractCompoundStates,
  mergeEntriesByValue,
  parseStyleEntries,
} from './exclusive';
import { parseStateKey } from './parseStateKey';
import { setWarningHandler } from './warnings';
import type {
  OracleMap,
  OracleState,
  RandomMapOptions,
} from '../test/state-oracle';
import {
  STATIC_ATOMS,
  allOracleStates,
  createRandom,
  describeState,
  randomStateMap,
  resolveStateMap,
} from '../test/state-oracle';

const STATES = allOracleStates();

/** A width inside every `STATIC_ATOMS` media range that is meant to hold. */
const VIEWPORT_WIDTH = 1000;

const MOD_ATOMS = ['alpha', 'beta', 'gamma', 'delta'];
const ALL_ATOMS = [
  ...MOD_ATOMS,
  ...MOD_ATOMS,
  'theme',
  'theme=dark',
  'theme=light',
  ':has(> [data-inner])',
  '@root(night)',
  '@parent(open)',
  ...Object.keys(STATIC_ATOMS),
];

function randomMaps(
  seed: number,
  count: number,
  options: Partial<RandomMapOptions> = {},
): OracleMap[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () =>
    randomStateMap(random, {
      atoms: MOD_ATOMS,
      maxKeys: 7,
      values: ['1', '2', '3', null],
      floorChance: 0.1,
      ...options,
    }),
  );
}

// ============================================================================
// Evaluating pipeline conditions in an oracle state
// ============================================================================

type Scope = 'element' | 'root' | 'parent';

function inRange(node: {
  lowerBound?: { valueNumeric: number | null; inclusive: boolean };
  upperBound?: { valueNumeric: number | null; inclusive: boolean };
}): boolean {
  const { lowerBound: lower, upperBound: upper } = node;
  const w = VIEWPORT_WIDTH;
  if (lower && lower.valueNumeric !== null) {
    if (lower.inclusive ? w < lower.valueNumeric : w <= lower.valueNumeric) {
      return false;
    }
  }
  if (upper && upper.valueNumeric !== null) {
    if (upper.inclusive ? w > upper.valueNumeric : w >= upper.valueNumeric) {
      return false;
    }
  }
  return true;
}

/** Does `node` hold in `state`? Covers the oracle's vocabulary only. */
function holds(
  node: ConditionNode,
  state: OracleState,
  scope: Scope = 'element',
): boolean {
  switch (node.kind) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'compound':
      return node.operator === 'AND'
        ? node.children.every((child) => holds(child, state, scope))
        : node.children.some((child) => holds(child, state, scope));
  }

  let result: boolean;

  switch (node.type) {
    case 'modifier': {
      const name = node.attribute.replace(/^data-/, '');
      if (scope === 'root') result = name === 'night' && state.night;
      else if (scope === 'parent') result = name === 'open' && state.open;
      else if (name === 'theme') {
        result =
          node.value === undefined
            ? state.theme !== null
            : state.theme === node.value;
      } else result = node.value === undefined && state.mods.has(name);
      break;
    }
    case 'pseudo':
      if (node.pseudo !== ':has(> [data-inner])') {
        throw new Error(`Unexpected pseudo ${node.pseudo}`);
      }
      result = state.inner;
      break;
    case 'media':
      result = inRange(node);
      break;
    case 'supports':
      result = node.condition.trim() === 'display: grid';
      break;
    case 'root':
      result = holds(node.innerCondition, state, 'root');
      break;
    case 'parent':
      result = holds(node.innerCondition, state, 'parent');
      break;
    default:
      throw new Error(`Unexpected condition type ${node.type}`);
  }

  return node.negated ? !result : result;
}

// ============================================================================
// Checks
// ============================================================================

interface Entry {
  stateKey: string;
  value: unknown;
  priority: number;
  condition: ConditionNode;
  floor?: boolean;
}

/** The oracle's answer, in the pipeline's terms (`null` = nothing set). */
function expectedValue(map: OracleMap, state: OracleState) {
  return resolveStateMap(map, state);
}

function withFloor(
  value: unknown,
  entries: { floor?: boolean; value: unknown }[],
) {
  const floor = entries.find((entry) => entry.floor);
  return (value ?? null) === null && floor ? floor.value : (value ?? null);
}

/** Resolve parsed entries by priority: the highest one that holds wins. */
function resolveEntries(entries: Entry[], state: OracleState) {
  let winner: Entry | undefined;
  for (const entry of entries) {
    if (entry.floor || !holds(entry.condition, state)) continue;
    if (!winner || entry.priority > winner.priority) winner = entry;
  }
  return withFloor(winner?.value, entries);
}

/**
 * Stages 0–3 on `map`, returning the first disagreement with the oracle, or
 * `null`. Exclusive entries must also partition the states: at most one
 * applies anywhere (besides the floor), or the CSS would depend on source
 * order.
 */
function checkStages(map: OracleMap): string | null {
  const reduced = extractCompoundStates(map) as OracleMap;
  for (const state of STATES) {
    if (resolveStateMap(reduced, state) !== expectedValue(map, state)) {
      return `stage 0 (${JSON.stringify(reduced)}) in ${describeState(state)}`;
    }
  }

  const parsed = parseStyleEntries('order', reduced, (key) =>
    parseStateKey(key),
  );
  const merged = mergeEntriesByValue(parsed);
  const expanded = expandOrConditions(merged);

  for (const [stage, entries] of [
    ['parse', parsed],
    ['merge by value', merged],
    ['OR expansion', expanded],
  ] as const) {
    for (const state of STATES) {
      const actual = resolveEntries(entries, state);
      const expected = expectedValue(map, state);
      if (actual !== expected) {
        return `${stage} in ${describeState(state)}: expected ${expected}, got ${actual}`;
      }
    }
  }

  const exclusive = buildExclusiveConditions(expanded);
  const deMorgan = expandExclusiveOrs(exclusive);

  for (const [stage, entries] of [
    ['exclusive', exclusive],
    ['De Morgan expansion', deMorgan],
  ] as const) {
    for (const state of STATES) {
      const applying = entries.filter(
        (entry) => !entry.floor && holds(entry.exclusiveCondition, state),
      );
      const values = new Set(applying.map((entry) => entry.value ?? null));
      if (values.size > 1) {
        return `${stage} in ${describeState(state)}: overlapping ${applying
          .map((entry) => `"${entry.stateKey}"`)
          .join(', ')}`;
      }
      const actual = withFloor(applying[0]?.value, entries);
      const expected = expectedValue(map, state);
      if (actual !== expected) {
        return `${stage} in ${describeState(state)}: expected ${expected}, got ${actual}`;
      }
    }
  }

  return null;
}

function failuresOf(maps: OracleMap[]): string[] {
  return maps.flatMap((map) => {
    const failure = checkStages(map);
    return failure ? [`${JSON.stringify(map)}\n  ${failure}`] : [];
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('extractCompoundStates', () => {
  it('drops a genuine don’t-care atom', () => {
    expect(
      extractCompoundStates({
        '': 'A',
        '@dark': 'B',
        '@hc': 'A',
        '@dark & @hc': 'B',
      }),
    ).toEqual({ '': 'A', '@dark': 'B' });
  });

  it('keeps a later key equal to the default that outranks an earlier key', () => {
    const map = {
      '': 'A',
      checked: 'B',
      'invalid & checked': 'C',
      disabled: 'A',
    };

    expect(extractCompoundStates(map)).toEqual(map);
  });

  it('keeps an atom whose key only matches a same-value key below it', () => {
    // `beta` has the default's value, but outranks `alpha & beta`.
    const map = { '': '1', 'alpha & beta': '2', alpha: '2', beta: '1' };

    expect(extractCompoundStates(map)).toEqual(map);
  });

  it('does not leave the `_` floor alone with the default', () => {
    // Every state equals the default, but `{ _, '' }` alone would mean "use
    // the floor" (REDUNDANT_DEFAULT_STATE), so the map is kept as written.
    const map = { _: 'F', '': 'A', alpha: 'A', 'alpha & beta': 'A' };

    expect(extractCompoundStates(map)).toBe(map);
  });

  it('leaves a map with more atoms than it can track unchanged', () => {
    const map: Record<string, string> = { '': 'A', 'x0 & y0': 'A' };
    for (let i = 1; i <= 32; i++) map[`x${i}`] = 'A';

    expect(extractCompoundStates(map)).toBe(map);
  });

  it('never changes how a map resolves', () => {
    const maps = [
      ...randomMaps(1, 1500),
      ...randomMaps(2, 1500, { atoms: ALL_ATOMS, operators: true }),
    ];

    const failures = maps.flatMap((map) => {
      const reduced = extractCompoundStates(map) as OracleMap;
      const state = STATES.find(
        (s) => resolveStateMap(reduced, s) !== resolveStateMap(map, s),
      );
      return state
        ? [
            `${JSON.stringify(map)} → ${JSON.stringify(reduced)} in ${describeState(state)}`,
          ]
        : [];
    });

    expect(failures).toEqual([]);
  });
});

describe('stages 0–3 keep state map priority', () => {
  let restoreWarnings: () => void;

  beforeEach(() => {
    restoreWarnings = setWarningHandler(vi.fn());
  });

  afterEach(() => {
    restoreWarnings();
  });

  it('a later key equal to the default outranks an earlier key', () => {
    expect(
      checkStages({ '': '1', alpha: '2', 'beta & alpha': '3', gamma: '1' }),
    ).toBeNull();
  });

  it('same-value keys that merge into an always-true entry block the default', () => {
    expect(
      checkStages({ '': '1', beta: '3', alpha: '2', '!alpha': '2' }),
    ).toBeNull();
  });

  it('same-value keys do not merge across an always-true entry', () => {
    expect(
      checkStages({ '': '1', alpha: '2', beta: '3', '!beta': '3', gamma: '2' }),
    ).toBeNull();
  });

  it('a key that always holds blocks every key below it', () => {
    expect(
      checkStages({ '': '1', alpha: '3', 'alpha | !alpha': '2', beta: '3' }),
    ).toBeNull();
  });

  it.each([1, 2, 3])('`&` of modifiers, seed %i', (seed) => {
    expect(failuresOf(randomMaps(100 + seed, 400))).toEqual([]);
  });

  it.each([1, 2, 3])('any operator and atom, seed %i', (seed) => {
    expect(
      failuresOf(
        randomMaps(200 + seed, 200, {
          atoms: ALL_ATOMS,
          operators: true,
          maxKeys: 5,
        }),
      ),
    ).toEqual([]);
  });
});
