/**
 * A reference model of how a style state map resolves, for tests.
 *
 * Tasty compiles a state map into mutually exclusive CSS rules through
 * several stages of boolean rewriting (see `docs/pipeline.md`). Each stage is
 * an optimization, and all of them must leave one thing unchanged: in any
 * state of the element, the value that applies is the value of the **last
 * authored key whose condition holds**. The bare `''` default sits below every
 * other key wherever it is authored, and the `_` fallback floor sits below
 * that.
 *
 * This module states that rule directly, with none of the pipeline's
 * machinery, so a test can compare what the generated CSS does against it in
 * every state. It understands a fixed vocabulary of atoms — enough to cover
 * boolean and value modifiers, `:has()`, `@root`, `@parent`, `@own`, and
 * at-rules — and the key syntax: `!`, `^`, `|`, `&` (tightest to loosest, as
 * in `parseStateKey`) and parentheses.
 */

/** Boolean modifiers on the styled element (`data-alpha`, …). */
export const ORACLE_MODS = ['alpha', 'beta', 'gamma', 'delta'] as const;

/** Atoms whose truth is fixed in the test browser. */
export const STATIC_ATOMS: Readonly<Record<string, boolean>> = {
  '@media(w > 1px)': true,
  '@media(w > 99999px)': false,
  '@media(w < 99999px)': true,
  '@media(w < 1px)': false,
  '@media(1px < w < 99999px)': true,
  '@supports(display: grid)': true,
  '@supports(display: frobnicate)': false,
};

/** One state of the styled element and its surroundings. */
export interface OracleState {
  /** Boolean modifiers set on the element. */
  mods: ReadonlySet<string>;
  /** Value of the element's `data-theme` attribute, if any. */
  theme: 'dark' | 'light' | null;
  /** `@root(night)`: `data-night` on the document element. */
  night: boolean;
  /** `@parent(open)`: `data-open` on the element's parent. */
  open: boolean;
  /** `:has(> [data-inner])`: a `data-inner` child of the element. */
  inner: boolean;
  /**
   * `@own(epsilon)`: `data-epsilon` on the sub-element itself. Only varied
   * for maps styling a sub-element (see `allOracleStates`).
   */
  own: boolean;
}

export type OracleValue = string | null;
export type OracleMap = Record<string, OracleValue>;

// ============================================================================
// Key evaluation
// ============================================================================

type Expr =
  | { kind: 'atom'; atom: string }
  | { kind: 'not'; operand: Expr }
  | { kind: 'op'; op: '&' | '|' | '^'; left: Expr; right: Expr };

const OPERATORS = new Set(['(', ')', '!', '&', '|', '^']);

function tokenize(key: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < key.length) {
    const ch = key[i];

    if (/\s/.test(ch)) {
      i++;
    } else if (OPERATORS.has(ch)) {
      tokens.push(ch);
      i++;
    } else {
      // An atom runs to the next space or operator, except that a `(` inside
      // it opens a function (`@media(...)`, `:has(...)`) whose balanced
      // parentheses are part of the atom.
      let j = i;
      while (j < key.length && !/\s/.test(key[j])) {
        if (key[j] === '(') {
          let depth = 0;
          for (; j < key.length; j++) {
            if (key[j] === '(') depth++;
            else if (key[j] === ')' && --depth === 0) break;
          }
          if (depth !== 0) throw new Error(`Oracle: bad parens in "${key}"`);
        } else if (OPERATORS.has(key[j])) {
          break;
        }
        j++;
      }
      tokens.push(key.slice(i, j));
      i = j;
    }
  }

  return tokens;
}

function parseKey(key: string): Expr {
  const tokens = tokenize(key);
  let pos = 0;

  const binary = (op: '&' | '|' | '^', next: () => Expr) => (): Expr => {
    let left = next();
    while (tokens[pos] === op) {
      pos++;
      left = { kind: 'op', op, left, right: next() };
    }
    return left;
  };

  const unary = (): Expr => {
    const token = tokens[pos++];
    if (token === '!') return { kind: 'not', operand: unary() };
    if (token === '(') {
      const inner = and();
      if (tokens[pos++] !== ')') throw new Error(`Oracle: bad parens "${key}"`);
      return inner;
    }
    if (token === undefined || OPERATORS.has(token)) {
      throw new Error(`Oracle: unexpected "${token}" in "${key}"`);
    }
    return { kind: 'atom', atom: token };
  };

  const xor = binary('^', unary);
  const or = binary('|', xor);
  const and = binary('&', or);

  const expr = and();
  if (pos !== tokens.length) throw new Error(`Oracle: trailing "${key}"`);
  return expr;
}

function evaluateAtom(atom: string, state: OracleState): boolean {
  if (atom in STATIC_ATOMS) return STATIC_ATOMS[atom];
  if ((ORACLE_MODS as readonly string[]).includes(atom)) {
    return state.mods.has(atom);
  }

  switch (atom) {
    case 'theme':
      return state.theme !== null;
    case 'theme=dark':
      return state.theme === 'dark';
    case 'theme=light':
      return state.theme === 'light';
    case '@root(night)':
      return state.night;
    case '@parent(open)':
      return state.open;
    case ':has(> [data-inner])':
      return state.inner;
    case '@own(epsilon)':
      return state.own;
  }

  throw new Error(`Oracle: unknown atom "${atom}"`);
}

function evaluate(expr: Expr, state: OracleState): boolean {
  switch (expr.kind) {
    case 'atom':
      return evaluateAtom(expr.atom, state);
    case 'not':
      return !evaluate(expr.operand, state);
    case 'op': {
      const left = evaluate(expr.left, state);
      const right = evaluate(expr.right, state);
      if (expr.op === '&') return left && right;
      if (expr.op === '|') return left || right;
      return left !== right;
    }
  }
}

const parsedKeys = new Map<string, Expr>();

/** Does state key `key` hold in `state`? */
export function evaluateKey(key: string, state: OracleState): boolean {
  let expr = parsedKeys.get(key);
  if (!expr) {
    expr = parseKey(key);
    parsedKeys.set(key, expr);
  }
  return evaluate(expr, state);
}

/**
 * The value `map` applies in `state`, or `null` when it applies nothing.
 *
 * The last authored key that holds wins. The `''` default applies only when
 * no other key holds, and the `_` floor applies wherever nothing else puts a
 * value (including under a winning key whose value is `null`). A map of only
 * `_` and `''` uses the floor, matching `REDUNDANT_DEFAULT_STATE`.
 */
export function resolveStateMap(
  map: OracleMap,
  state: OracleState,
): OracleValue {
  const keys = Object.keys(map);
  let winner: { value: OracleValue } | undefined;

  for (const key of keys) {
    if (key === '' || key === '_') continue;
    if (evaluateKey(key, state)) winner = { value: map[key] };
  }

  const onlyDefaultAndFloor = keys.every((key) => key === '' || key === '_');

  if (!winner && '' in map && !(onlyDefaultAndFloor && '_' in map)) {
    winner = { value: map[''] };
  }

  const value = winner?.value ?? null;
  if (value === null && '_' in map) return map._;
  return value;
}

// ============================================================================
// States
// ============================================================================

/**
 * Every combination of the dimensions in `OracleState`. `own` is only varied
 * when `withOwn` is set, since only a sub-element has an own state.
 */
export function allOracleStates(withOwn = false): OracleState[] {
  const states: OracleState[] = [];
  const bools = [false, true];

  for (let bits = 0; bits < 1 << ORACLE_MODS.length; bits++) {
    const mods = new Set(ORACLE_MODS.filter((_, i) => bits & (1 << i)));
    for (const theme of [null, 'dark', 'light'] as const) {
      for (const night of bools) {
        for (const open of bools) {
          for (const inner of bools) {
            for (const own of withOwn ? bools : [false]) {
              states.push({ mods, theme, night, open, inner, own });
            }
          }
        }
      }
    }
  }

  return states;
}

/** A short readable form of `state` for failure messages. */
export function describeState(state: OracleState): string {
  const parts = [...state.mods];
  if (state.theme) parts.push(`theme=${state.theme}`);
  if (state.night) parts.push('@root(night)');
  if (state.open) parts.push('@parent(open)');
  if (state.inner) parts.push(':has(> [data-inner])');
  if (state.own) parts.push('@own(epsilon)');
  return parts.length ? parts.join(' ') : '(none)';
}

// ============================================================================
// Random maps
// ============================================================================

/** A seeded PRNG (mulberry32), so every generated map is reproducible. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export interface RandomMapOptions {
  /** Atoms keys are built from. */
  atoms: readonly string[];
  /** Upper bound on non-default keys. */
  maxKeys: number;
  /** Values keys are given; a small pool makes collisions likely. */
  values: readonly OracleValue[];
  /** Allow `|`, `^`, `!` and parenthesized groups, not just `&` of atoms. */
  operators?: boolean;
  /** Probability of a `''` default (always authored first). */
  defaultChance?: number;
  /** Probability of a `_` floor. */
  floorChance?: number;
}

function randomTerm(
  random: () => number,
  options: RandomMapOptions,
  depth: number,
): string {
  const roll = random();

  if (!options.operators || depth > 1 || roll < 0.55) {
    const atom = pick(random, options.atoms);
    return options.operators && random() < 0.2 ? `!${atom}` : atom;
  }

  if (roll < 0.65) return `!(${randomExpr(random, options, depth + 1)})`;

  const op = roll < 0.85 ? '|' : roll < 0.95 ? '&' : '^';
  const left = randomTerm(random, options, depth + 1);
  const right = randomTerm(random, options, depth + 1);
  return `(${left} ${op} ${right})`;
}

function randomExpr(
  random: () => number,
  options: RandomMapOptions,
  depth = 0,
): string {
  // Mostly one to three `&`-joined terms, the way maps are usually written.
  const count = 1 + Math.floor(random() * random() * 3.5);
  const terms = new Set<string>();
  for (let i = 0; i < count; i++) {
    terms.add(randomTerm(random, options, depth));
  }
  return [...terms].join(' & ');
}

/** A random state map built from `options`. */
export function randomStateMap(
  random: () => number,
  options: RandomMapOptions,
): OracleMap {
  const map: OracleMap = {};

  if (random() < (options.floorChance ?? 0)) {
    map._ = pick(
      random,
      options.values.filter((v) => v !== null),
    );
  }
  if (random() < (options.defaultChance ?? 0.8)) {
    map[''] = pick(
      random,
      options.values.filter((v) => v !== null),
    );
  }

  const keyCount = 1 + Math.floor(random() * options.maxKeys);
  for (let i = 0; i < keyCount; i++) {
    const key = randomExpr(random, options);
    if (!(key in map)) map[key] = pick(random, options.values);
  }

  return map;
}

/** Every ordering of `items`. */
export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];

  const result: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) result.push([item, ...tail]);
  });
  return result;
}
