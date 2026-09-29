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

/**
 * The generated-map tests run the pipeline on hundreds of maps each, so their
 * time scales with the machine: CI runners are several times slower than a
 * laptop. Each batch takes about a second locally.
 */
const PROPERTY_TIMEOUT = 30_000;

/** A width inside every `STATIC_ATOMS` media range that is meant to hold. */
const VIEWPORT_WIDTH = 1000;

const MOD_ATOMS = ['alpha', 'beta', 'gamma', 'd'];
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

type Predicate = (state: OracleState) => boolean;

const always: Predicate = () => true;
const never: Predicate = () => false;

/**
 * Compile `node` into a test of whether it holds in an oracle state. Covers
 * the oracle's vocabulary only. Compiling once per entry keeps the checks
 * below cheap enough to run on every state of thousands of maps.
 */
function compile(node: ConditionNode, scope: Scope = 'element'): Predicate {
  switch (node.kind) {
    case 'true':
      return always;
    case 'false':
      return never;
    case 'compound': {
      const children = node.children.map((child) => compile(child, scope));
      return node.operator === 'AND'
        ? (state) => children.every((child) => child(state))
        : (state) => children.some((child) => child(state));
    }
  }

  let test: Predicate;

  switch (node.type) {
    case 'modifier': {
      const name = node.attribute.replace(/^data-/, '');
      if (scope === 'root') {
        test = name === 'night' ? (state) => state.night : never;
      } else if (scope === 'parent') {
        test = name === 'open' ? (state) => state.open : never;
      } else if (name === 'theme') {
        const { value } = node;
        test =
          value === undefined
            ? (state) => state.theme !== null
            : (state) => state.theme === value;
      } else {
        test =
          node.value === undefined ? (state) => state.mods.has(name) : never;
      }
      break;
    }
    case 'pseudo':
      if (node.pseudo !== ':has(> [data-inner])') {
        throw new Error(`Unexpected pseudo ${node.pseudo}`);
      }
      test = (state) => state.inner;
      break;
    case 'media':
      test = inRange(node) ? always : never;
      break;
    case 'supports':
      test = node.condition.trim() === 'display: grid' ? always : never;
      break;
    case 'root':
      test = compile(node.innerCondition, 'root');
      break;
    case 'parent':
      test = compile(node.innerCondition, 'parent');
      break;
    default:
      throw new Error(`Unexpected condition type ${node.type}`);
  }

  return node.negated ? (state) => !test(state) : test;
}

// ============================================================================
// Checks
// ============================================================================

function withFloor(
  value: unknown,
  entries: { floor?: boolean; value: unknown }[],
) {
  const floor = entries.find((entry) => entry.floor);
  return (value ?? null) === null && floor ? floor.value : (value ?? null);
}

/**
 * Stages 0–3 on `map`, returning the first disagreement with the oracle, or
 * `null`. Exclusive entries must also partition the states: at most one
 * applies anywhere (besides the floor), or the CSS would depend on source
 * order.
 */
function checkStages(map: OracleMap): string | null {
  // The oracle's answer in each state, in the pipeline's terms (`null` =
  // nothing set).
  const expected = STATES.map((state) => resolveStateMap(map, state));

  const reduced = extractCompoundStates(map) as OracleMap;
  const stage0 = STATES.findIndex(
    (state, i) => resolveStateMap(reduced, state) !== expected[i],
  );
  if (stage0 !== -1) {
    return `stage 0 (${JSON.stringify(reduced)}) in ${describeState(STATES[stage0])}`;
  }

  const parsed = parseStyleEntries('order', reduced, (key) =>
    parseStateKey(key),
  );
  const merged = mergeEntriesByValue(parsed);
  const expanded = expandOrConditions(merged);

  // Before stage 2b, entries may overlap: the highest priority that holds
  // wins.
  for (const [stage, entries] of [
    ['parse', parsed],
    ['merge by value', merged],
    ['OR expansion', expanded],
  ] as const) {
    const byPriority = entries
      .filter((entry) => !entry.floor)
      .sort((a, b) => b.priority - a.priority)
      .map((entry) => ({
        value: entry.value,
        holds: compile(entry.condition),
      }));

    for (const [i, state] of STATES.entries()) {
      const winner = byPriority.find((entry) => entry.holds(state));
      const actual = withFloor(winner?.value, entries);
      if (actual !== expected[i]) {
        return `${stage} in ${describeState(state)}: expected ${expected[i]}, got ${actual}`;
      }
    }
  }

  const exclusive = buildExclusiveConditions(expanded);
  const deMorgan = expandExclusiveOrs(exclusive);

  for (const [stage, entries] of [
    ['exclusive', exclusive],
    ['De Morgan expansion', deMorgan],
  ] as const) {
    const compiled = entries
      .filter((entry) => !entry.floor)
      .map((entry) => ({
        ...entry,
        holds: compile(entry.exclusiveCondition),
      }));

    for (const [i, state] of STATES.entries()) {
      const applying = compiled.filter((entry) => entry.holds(state));
      const values = new Set(applying.map((entry) => entry.value ?? null));
      if (values.size > 1) {
        return `${stage} in ${describeState(state)}: overlapping ${applying
          .map((entry) => `"${entry.stateKey}"`)
          .join(', ')}`;
      }
      const actual = withFloor(applying[0]?.value, entries);
      if (actual !== expected[i]) {
        return `${stage} in ${describeState(state)}: expected ${expected[i]}, got ${actual}`;
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

  it('never changes how a map resolves', { timeout: PROPERTY_TIMEOUT }, () => {
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

  it.each([1, 2, 3])(
    '`&` of modifiers, seed %i',
    (seed) => {
      expect(failuresOf(randomMaps(100 + seed, 400))).toEqual([]);
    },
    PROPERTY_TIMEOUT,
  );

  it.each([1, 2, 3, 4, 5, 6])(
    'any operator and atom, seed %i',
    (seed) => {
      expect(
        failuresOf(
          randomMaps(200 + seed, 100, {
            atoms: ALL_ATOMS,
            operators: true,
            maxKeys: 5,
          }),
        ),
      ).toEqual([]);
    },
    PROPERTY_TIMEOUT,
  );
});
