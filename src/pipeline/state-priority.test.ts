/**
 * State-map priority, checked against a real cascade.
 *
 * The one guarantee every pipeline stage has to keep is that a state map
 * resolves by authored order: in any state, the last key whose condition
 * holds wins, and the `''` default applies only when no other key does. The
 * stages that simplify a map on the way to CSS (don't-care extraction,
 * same-value merging, exclusive negation, OR expansion, rule merging) are
 * each allowed to rewrite it only in ways that keep that true.
 *
 * Asserting on CSS text cannot tell whether they did: a wrong rewrite is
 * still well-formed CSS, and a snapshot of it passes. So these tests render
 * each map, put the CSS in the page, and read back what the browser actually
 * applies — in every combination of the states the map can see — comparing
 * it with `resolveStateMap`, a direct statement of the priority rule in
 * `src/test/state-oracle.ts`.
 *
 * The value is carried by `order`, which applies to any element and computes
 * to the integer it was given (`0` when nothing sets it).
 */
import { computeStyles } from '../compute-styles';
import { destroy } from '../injector';
import { ServerStyleCollector } from '../ssr/collector';
import { formatRules } from '../ssr/format-rules';
import type { Styles } from '../styles/types';
import type { OracleMap } from '../test/state-oracle';
import {
  ORACLE_MODS,
  allOracleStates,
  createRandom,
  describeState,
  permutations,
  randomStateMap,
  resolveStateMap,
} from '../test/state-oracle';

import { clearPipelineCache, renderStyles } from './index';
import { setWarningHandler } from './warnings';

type RenderPath = 'pipeline' | 'runtime' | 'ssr';

interface CheckOptions {
  /** How the CSS is produced and the class allocated. */
  path: RenderPath;
  /**
   * Style a `Title` sub-element with the map instead of the root. Keys then
   * still read the root's states, and `@own(epsilon)` reads the sub-element's.
   */
  subElement?: boolean;
}

interface Target {
  map: OracleMap;
  parent: HTMLElement;
  /** The element that carries the class and the states. */
  root: HTMLElement;
  /** A child of `root`, for `:has(> [data-inner])`. */
  inner: HTMLElement;
  /** The element the map styles: `root`, or its `Title` sub-element. */
  styled: HTMLElement;
  css: string;
}

interface OrderRule {
  selector: string;
  value: string;
  /** Whether every `@media` / `@supports` around the rule holds here. */
  active: boolean;
}

/** How many failing states to report per map. */
const REPORTED_STATES = 6;

function stylesFor(map: OracleMap, subElement = false): Styles {
  const styles = { order: map };
  return (subElement ? { Title: styles } : styles) as unknown as Styles;
}

/** Every style rule in the document that sets `order`. */
function collectOrderRules(): OrderRule[] {
  const rules: OrderRule[] = [];

  const walk = (list: CSSRuleList, active: boolean) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, active && matchMedia(rule.media.mediaText).matches);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, active && CSS.supports(rule.conditionText));
      } else if (rule instanceof CSSStyleRule) {
        const value = rule.style.getPropertyValue('order');
        if (value) rules.push({ selector: rule.selectorText, value, active });
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, true);
  }

  return rules;
}

function mountTarget(map: OracleMap, subElement: boolean): Target {
  const parent = document.createElement('div');
  const root = document.createElement('div');
  const inner = document.createElement('span');
  root.append(inner);
  parent.append(root);

  let styled = root;
  if (subElement) {
    styled = document.createElement('div');
    styled.setAttribute('data-element', 'Title');
    root.append(styled);
  }

  return { map, parent, root, inner, styled, css: '' };
}

/**
 * Render every map, apply each state to all of them at once, and return one
 * message per map that misbehaves anywhere. All maps are mounted together, as
 * components on one page would be.
 *
 * Two things are checked in every state:
 *
 * - the computed `order` is the value the oracle resolves;
 * - rules are mutually exclusive: at most one distinct value applies (plus
 *   the `_` floor, which is layered underneath by design). Two overlapping
 *   rules can still compute the right value, because the cascade sort puts
 *   the higher-priority one last, but the pipeline promises not to rely on
 *   that — so an overlap is a failure even when the value is right.
 */
function checkPriority(
  maps: OracleMap[],
  { path, subElement = false }: CheckOptions,
): string[] {
  const container = document.createElement('div');
  const sheet = document.createElement('style');
  const collector = path === 'ssr' ? new ServerStyleCollector() : null;

  const targets = maps.map((map, index) => {
    const target = mountTarget(map, subElement);
    container.append(target.parent);

    const styles = stylesFor(map, subElement);
    if (path === 'pipeline') {
      const className = `sp${index}`;
      target.css = formatRules(renderStyles(styles).rules, className);
      target.root.className = className;
    } else {
      target.root.className = computeStyles(
        styles,
        collector ? { ssrCollector: collector } : undefined,
      ).className;
    }

    return target;
  });

  sheet.textContent = collector
    ? collector.getCSS()
    : targets.map((t) => t.css).join('\n');
  document.head.append(sheet);
  document.body.append(container);

  const mismatches = targets.map(() => [] as string[]);
  const activeRules = collectOrderRules().filter((rule) => rule.active);
  // Only a rule naming one of the root's classes can match what it styles.
  const rulesOf = targets.map(({ root }) => {
    const classes = [...root.classList].map(
      (name) => new RegExp(`\\.${name}(?![\\w-])`),
    );
    return activeRules.filter((rule) =>
      classes.some((pattern) => pattern.test(rule.selector)),
    );
  });

  try {
    for (const state of allOracleStates(subElement)) {
      document.documentElement.toggleAttribute('data-night', state.night);

      for (const { parent, root, inner, styled } of targets) {
        parent.toggleAttribute('data-open', state.open);
        for (const mod of ORACLE_MODS) {
          root.toggleAttribute(`data-${mod}`, state.mods.has(mod));
        }
        if (state.theme) root.setAttribute('data-theme', state.theme);
        else root.removeAttribute('data-theme');
        inner.toggleAttribute('data-inner', state.inner);
        if (subElement) styled.toggleAttribute('data-epsilon', state.own);
      }

      targets.forEach((target, index) => {
        if (mismatches[index].length >= REPORTED_STATES) return;

        const expected = resolveStateMap(target.map, state) ?? '0';
        const actual = getComputedStyle(target.styled).order;

        if (actual !== expected) {
          mismatches[index].push(
            `    ${describeState(state)}: expected ${expected}, got ${actual}`,
          );
          return;
        }

        const floor = target.map._ ?? undefined;
        const applied = new Set(
          rulesOf[index]
            .filter((rule) => target.styled.matches(rule.selector))
            .map((rule) => rule.value)
            .filter((value) => value !== floor),
        );

        if (applied.size > 1) {
          mismatches[index].push(
            `    ${describeState(state)}: overlapping rules set ${[...applied].join(' and ')}`,
          );
        }
      });
    }
  } finally {
    document.documentElement.removeAttribute('data-night');
    container.remove();
    sheet.remove();
  }

  const where = subElement ? `${path}, sub-element` : path;

  return targets.flatMap((target, index) =>
    mismatches[index].length === 0
      ? []
      : [
          [
            `${where}: ${JSON.stringify(target.map)}`,
            ...mismatches[index],
            ...(target.css ? [`  CSS:\n${target.css}`] : []),
          ].join('\n'),
        ],
  );
}

describe('state map priority (checked against the browser cascade)', () => {
  let restoreWarnings: () => void;

  beforeEach(() => {
    clearPipelineCache();
    // Misplaced defaults and the like warn by design; that is not what these
    // tests are about.
    restoreWarnings = setWarningHandler(vi.fn());
  });

  afterEach(() => {
    restoreWarnings();
    destroy();
  });

  describe('hand-written cases', () => {
    const CASES: [name: string, map: OracleMap][] = [
      // The reported bug: `gamma` has the default's value, and was merged
      // into `''` once the `&` key switched don't-care extraction on — losing
      // its priority over `alpha`.
      [
        'a later key equal to the default outranks an earlier key',
        { '': '1', alpha: '2', 'beta & alpha': '3', gamma: '1' },
      ],
      [
        'the same map without the compound key',
        { '': '1', alpha: '2', gamma: '1' },
      ],
      [
        'the same map with the never-matching workaround key',
        {
          '': '1',
          alpha: '2',
          'beta & alpha': '3',
          'gamma & alpha': '4',
          gamma: '1',
        },
      ],
      [
        'a later key equal to the default outranks an earlier compound key',
        { '': '1', 'alpha & beta': '2', gamma: '1', 'delta & alpha': '3' },
      ],
      [
        'a genuine don’t-care atom (full truth table)',
        { '': '1', alpha: '2', beta: '1', 'alpha & beta': '2' },
      ],
      [
        'the truth table reordered so the single-atom key wins',
        { '': '1', 'alpha & beta': '2', alpha: '2', beta: '1' },
      ],
      [
        'a compound key equal to a later single key keeps its position',
        { '': '1', 'alpha & beta': '2', gamma: '3', beta: '2' },
      ],
      [
        'a full truth table with distinct values',
        { '': '1', alpha: '2', beta: '3', 'alpha & beta': '4' },
      ],
      [
        'the compound key authored first loses to both atoms',
        { '': '1', 'alpha & beta': '4', alpha: '2', beta: '3' },
      ],
      [
        'same-value keys interleaved with other values',
        { '': '1', alpha: '2', beta: '3', gamma: '2', 'alpha & delta': '1' },
      ],
      [
        'a long cascade where later keys repeat earlier values',
        {
          '': '1',
          alpha: '2',
          'alpha & beta': '3',
          beta: '1',
          gamma: '2',
          'gamma & delta': '1',
          delta: '3',
        },
      ],
      [
        'keys with the same atoms in a different order',
        { '': '1', 'alpha & beta': '2', gamma: '3', 'beta & alpha': '4' },
      ],
      [
        'an OR key between same-value keys',
        { '': '1', 'alpha | beta': '2', 'alpha & gamma': '1', beta: '3' },
      ],
      [
        'negated atoms',
        { '': '1', '!alpha': '2', 'alpha & beta': '2', beta: '1' },
      ],
      [
        'negated compound',
        { '': '1', '!(alpha & beta)': '2', gamma: '1', 'alpha & gamma': '3' },
      ],
      [
        'XOR',
        { '': '1', 'alpha ^ beta': '2', 'alpha & gamma': '3', gamma: '2' },
      ],
      [
        '`&` binds loosest: `alpha & beta | gamma` is `alpha & (beta | gamma)`',
        { '': '1', 'alpha & beta | gamma': '2', beta: '1' },
      ],
      [
        '`!` binds tightest: `!alpha | beta`',
        { '': '1', '!alpha | beta': '2', 'alpha & gamma': '3' },
      ],
      [
        'value modifiers that exclude each other',
        { '': '1', 'theme=dark': '2', 'theme=light & alpha': '3', theme: '1' },
      ],
      [
        'a boolean modifier over its own values',
        { '': '1', theme: '2', 'theme=dark': '1', 'theme=dark & alpha': '2' },
      ],
      [
        'the reported shape with @root',
        {
          '': '1',
          alpha: '2',
          '@root(night) & beta': '3',
          '@root(night)': '1',
        },
      ],
      [
        'the reported shape with @parent',
        {
          '': '1',
          alpha: '2',
          '@parent(open) & beta': '3',
          '@parent(open)': '1',
        },
      ],
      [
        '@root and @parent against element modifiers',
        {
          '': '1',
          '@root(night)': '2',
          '@parent(open) & alpha': '3',
          alpha: '1',
          '@root(night) & beta': '4',
        },
      ],
      [
        'the reported shape with @supports',
        {
          '': '1',
          '@media(w > 1px) & alpha': '2',
          beta: '3',
          '@supports(display: grid)': '1',
        },
      ],
      [
        'at-rules that never match',
        {
          '': '1',
          alpha: '2',
          '@media(w > 99999px) & beta': '3',
          '@supports(display: frobnicate)': '4',
          '!@supports(display: frobnicate) & gamma': '1',
        },
      ],
      [
        'no default: the same shape',
        { alpha: '1', 'alpha & beta': '2', gamma: '3', beta: '1' },
      ],
      [
        'no default: a later key equal to an earlier one',
        { alpha: '1', beta: '2', 'alpha & gamma': '3', gamma: '1' },
      ],
      [
        'the `_` floor under the same shape',
        { _: '5', alpha: '1', 'alpha & beta': '2', beta: '1' },
      ],
      [
        'the `_` floor with every state equal to the default',
        { _: '5', '': '1', alpha: '1', 'alpha & beta': '1' },
      ],
      [
        'null values leave the property unset',
        { '': '1', alpha: null, 'alpha & beta': '2', beta: null },
      ],
      [
        'null values let the `_` floor through',
        { _: '5', '': '1', alpha: null, 'beta & alpha': '2' },
      ],
      [
        'a misplaced default still sits below every key',
        { alpha: '2', '': '1', 'alpha & beta': '3', beta: '1' },
      ],
      // Same-value keys that merge into a condition that always holds: the
      // merged entry must still block everything below it, the default
      // included, instead of being treated as a second default.
      [
        'a modifier and its negation with one value',
        { '': '1', alpha: '2', '!alpha': '2', beta: '3' },
      ],
      [
        'a modifier and its negation with one value, authored last',
        { '': '1', beta: '3', alpha: '2', '!alpha': '2' },
      ],
      [
        'a value modifier and its negation with one value',
        { '': '1', 'theme=dark': '2', '!theme=dark': '2', beta: '3' },
      ],
      [
        'a media query and its negation with one value',
        {
          '': '1',
          '@media(w > 1px)': '2',
          '!@media(w > 1px)': '2',
          alpha: '3',
        },
      ],
      [
        'a key that always holds',
        { '': '1', alpha: '3', 'alpha | !alpha': '2', beta: '3' },
      ],
      [
        'same-value keys do not merge across keys that together always hold',
        { '': '1', alpha: '2', beta: '3', '!beta': '3', gamma: '2' },
      ],
      [
        'keys that together always hold, without a default',
        { alpha: '2', '!alpha & beta': '2', '!alpha & !beta': '2', gamma: '3' },
      ],
      [
        ':has() against element modifiers',
        {
          '': '1',
          alpha: '2',
          ':has(> [data-inner]) & beta': '3',
          ':has(> [data-inner])': '1',
        },
      ],
      [
        'overlapping media ranges',
        {
          '': '1',
          '@media(w < 99999px) & alpha': '2',
          '@media(1px < w < 99999px)': '3',
          '@media(w > 1px) & beta': '1',
          '@media(w < 1px)': '4',
        },
      ],
    ];

    // Keys in a sub-element's map read the root's states; `@own()` reads the
    // sub-element's own.
    const SUB_ELEMENT_CASES: [name: string, map: OracleMap][] = [
      [
        'the reported shape with @own',
        {
          '': '1',
          alpha: '2',
          '@own(epsilon) & beta': '3',
          '@own(epsilon)': '1',
        },
      ],
      [
        'root and own states interleaved',
        {
          '': '1',
          '@own(epsilon)': '2',
          'alpha & @own(epsilon)': '3',
          alpha: '2',
          '!@own(epsilon) & beta': '1',
        },
      ],
    ];

    it.each(CASES)('%s', (_name, map) => {
      expect(checkPriority([map], { path: 'pipeline' })).toEqual([]);
      expect(checkPriority([map], { path: 'runtime' })).toEqual([]);
      expect(
        checkPriority([map], { path: 'pipeline', subElement: true }),
      ).toEqual([]);
    });

    it.each(SUB_ELEMENT_CASES)('sub-element: %s', (_name, map) => {
      expect(
        checkPriority([map], { path: 'pipeline', subElement: true }),
      ).toEqual([]);
      expect(
        checkPriority([map], { path: 'runtime', subElement: true }),
      ).toEqual([]);
    });
  });

  describe('every ordering of the same keys', () => {
    // Values chosen so reorderings create every kind of coincidence: keys
    // equal to the default, to each other, and to nothing.
    const ENTRIES: [string, string][] = [
      ['alpha', '2'],
      ['beta', '1'],
      ['alpha & gamma', '3'],
      ['!delta', '2'],
      ['theme=dark & beta', '4'],
    ];

    const maps = permutations(ENTRIES).map((entries): OracleMap => ({
      '': '1',
      ...Object.fromEntries(entries),
    }));

    // All orderings are mounted at once: the runtime and SSR paths allocate
    // one class per distinct style, so an order-insensitive cache key would
    // make every ordering render the first one's rules.
    it.each(['pipeline', 'runtime', 'ssr'] as const)('%s', (path) => {
      expect(checkPriority(maps, { path })).toEqual([]);
    });

    it.each(['pipeline', 'runtime', 'ssr'] as const)(
      '%s, in a sub-element',
      (path) => {
        expect(checkPriority(maps, { path, subElement: true })).toEqual([]);
      },
    );
  });

  describe('random maps', () => {
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
      '@media(w > 1px)',
      '@media(w > 99999px)',
      '@media(w < 99999px)',
      '@media(w < 1px)',
      '@media(1px < w < 99999px)',
      '@supports(display: grid)',
      '@supports(display: frobnicate)',
    ];

    function randomMaps(
      seed: number,
      count: number,
      operators: boolean,
      extraAtoms: string[] = [],
    ) {
      const random = createRandom(seed);
      return Array.from({ length: count }, () =>
        randomStateMap(random, {
          atoms: [...(operators ? ALL_ATOMS : MOD_ATOMS), ...extraAtoms],
          maxKeys: operators ? 5 : 7,
          values: ['1', '2', '3', null],
          operators,
          floorChance: 0.1,
        }),
      );
    }

    // `&`-only maps over boolean modifiers: the shape most maps are written
    // in, and the one don't-care extraction and same-value merging act on.
    it.each([1, 2, 3, 4])('`&` of modifiers, seed %i', (seed) => {
      expect(
        checkPriority(randomMaps(seed, 150, false), { path: 'pipeline' }),
      ).toEqual([]);
    });

    // Every operator and every kind of atom in the vocabulary.
    it.each([11, 12, 13, 14, 15, 16])(
      'any operator and atom, seed %i',
      (seed) => {
        expect(
          checkPriority(randomMaps(seed, 100, true), { path: 'pipeline' }),
        ).toEqual([]);
      },
    );

    it.each([31, 32])('in a sub-element, seed %i', (seed) => {
      const maps = [
        ...randomMaps(seed, 40, false, ['@own(epsilon)']),
        ...randomMaps(seed + 100, 40, true, ['@own(epsilon)']),
      ];
      expect(
        checkPriority(maps, { path: 'pipeline', subElement: true }),
      ).toEqual([]);
    });

    it('the runtime path agrees with the oracle', () => {
      const maps = [...randomMaps(21, 60, false), ...randomMaps(22, 60, true)];
      expect(checkPriority(maps, { path: 'runtime' })).toEqual([]);
    });
  });
});
