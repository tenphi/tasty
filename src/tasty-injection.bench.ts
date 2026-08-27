import { bench, describe } from 'vitest';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { destroy } from './injector';
import { clearPipelineCache } from './pipeline';
import { clearConditionCache } from './pipeline/materialize';
import { clearParseCache } from './pipeline/parseStateKey';
import { clearSimplifyCache } from './pipeline/simplify';
import type { Styles } from './styles/types';
import { getGlobalParser } from './utils/styles';

/**
 * Measures Tasty's cold new-rule path against equivalent CSS that is already
 * parsed and attached to the page.
 *
 * Two workloads keep the style-resolution boundary explicit:
 *
 * 1. One rule — add one new rule to an existing Tasty stylesheet, append one
 *    element, and force its computed style. A timed sample performs 50
 *    independent one-rule transactions and reports their total so the result
 *    stays above Chromium's timer resolution.
 * 2. 1,000 rules together — generate and inject every rule into one existing
 *    stylesheet, append all 1,000 elements, then force their computed styles
 *    without writes in between.
 *
 * In both controls, all equivalent CSS is parsed and attached before timing.
 * Every runtime stylesheet is warmed with an unrelated rule before timing, so
 * creating and adopting Tasty's stylesheet is excluded. The subtraction is
 * cold generation + injector bookkeeping + rule insertion, including any
 * extra invalidation visible at the workload's resolution boundary.
 */

const ITERATIONS = 30;
const WARMUP_ITERATIONS = 5;

const BENCH_OPTIONS = {
  // A fixed sample count lets setup prepare fresh roots for every timed sample.
  // All preparation and cleanup stay outside Tinybench's sample timer.
  iterations: ITERATIONS,
  time: 0,
  warmupIterations: WARMUP_ITERATIONS,
  warmupTime: 0,
} as const;

const SENTINEL_CLASS_NAME = 'benchmark-sentinel';
const SENTINEL_CSS = `.${SENTINEL_CLASS_NAME}.${SENTINEL_CLASS_NAME} { display: block; }`;
const SENTINEL_STYLES = Object.freeze({ display: 'block' }) as Styles;

interface Workload {
  name: string;
  rulesPerTransaction: number;
  transactionsPerSample: number;
  valueOffset: number;
}

const ONE_RULE: Workload = {
  name: 'one new rule (50 independent transactions per sample)',
  rulesPerTransaction: 1,
  transactionsPerSample: 50,
  valueOffset: 0,
};

const ONE_THOUSAND_RULES: Workload = {
  name: '1,000 new rules together (one transaction per sample)',
  rulesPerTransaction: 1_000,
  transactionsPerSample: 1,
  valueOffset: 100_000,
};

interface PreparedTree {
  classNames: string[];
  fragment: DocumentFragment;
  host: HTMLDivElement;
  root: ShadowRoot;
  styles: Styles[];
  targets: HTMLDivElement[];
}

interface PreparedSample {
  trees: PreparedTree[];
}

interface BenchmarkHarness {
  run(): void;
  setup(mode: 'warmup' | 'run'): void;
  teardown(): void;
}

let styleChecksum = 0;

function colorFor(
  workload: Workload,
  sample: number,
  transaction: number,
  index: number,
): string {
  const rulesPerSample =
    workload.transactionsPerSample * workload.rulesPerTransaction;
  const value =
    workload.valueOffset +
    sample * rulesPerSample +
    transaction * workload.rulesPerTransaction +
    index;

  return `rgb(${value % 256}, ${Math.floor(value / 256) % 256}, ${Math.floor(value / 65_536) % 256})`;
}

function clearAllCaches() {
  clearPipelineCache();
  clearParseCache();
  clearConditionCache();
  clearSimplifyCache();
  getGlobalParser().clearCache();
}

function prepareTree(
  workload: Workload,
  sample: number,
  transaction: number,
  withExistingCSS: boolean,
): PreparedTree {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const fragment = document.createDocumentFragment();
  const targets = Array.from({ length: workload.rulesPerTransaction }, () =>
    document.createElement('div'),
  );
  const classNames = Array.from(
    { length: workload.rulesPerTransaction },
    (_, index) =>
      `s${workload.valueOffset.toString(36)}-${sample.toString(36).padStart(2, '0')}-${transaction.toString(36).padStart(2, '0')}-${index.toString(36).padStart(4, '0')}`,
  );
  const styles = Array.from(
    { length: workload.rulesPerTransaction },
    (_, index) =>
      Object.freeze({
        color: colorFor(workload, sample, transaction, index),
      }) as Styles,
  );

  if (withExistingCSS) {
    const css = [
      SENTINEL_CSS,
      ...classNames.map(
        (className, index) =>
          `.${className}.${className} { color: ${colorFor(workload, sample, transaction, index)}; }`,
      ),
    ].join('\n');
    const sheet = new CSSStyleSheet();

    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } else {
    // Create and adopt Tasty's constructable stylesheet before timing. The
    // workload measures incremental rules, not one-time sheet setup.
    computeStyles(SENTINEL_STYLES, { root });
  }

  document.body.append(host);

  return { classNames, fragment, host, root, styles, targets };
}

function prepareSample(
  workload: Workload,
  sample: number,
  withExistingCSS: boolean,
): PreparedSample {
  return {
    trees: Array.from(
      { length: workload.transactionsPerSample },
      (_, transaction) =>
        prepareTree(workload, sample, transaction, withExistingCSS),
    ),
  };
}

function readComputedColors(targets: HTMLDivElement[]) {
  for (const target of targets) {
    const color = getComputedStyle(target).color;
    styleChecksum += color.length + color.charCodeAt(0);
  }
}

function commitExistingStyles(tree: PreparedTree) {
  for (let index = 0; index < tree.targets.length; index++) {
    const target = tree.targets[index];
    target.className = tree.classNames[index];
    tree.fragment.append(target);
  }

  tree.root.append(tree.fragment);
  readComputedColors(tree.targets);
}

function generateInjectAndCommit(tree: PreparedTree) {
  for (let index = 0; index < tree.targets.length; index++) {
    const target = tree.targets[index];
    const result = computeStyles(tree.styles[index], { root: tree.root });

    target.className = result.className;
    tree.fragment.append(target);
  }

  tree.root.append(tree.fragment);
  readComputedColors(tree.targets);
}

function cleanSample(sample: PreparedSample) {
  for (const tree of sample.trees) {
    destroy(tree.root);
    tree.host.remove();
  }
}

function createHarness(
  workload: Workload,
  withExistingCSS: boolean,
): BenchmarkHarness {
  let cursor = 0;
  let samples: PreparedSample[] = [];

  return {
    run() {
      const sample = samples[cursor++];

      if (!sample) {
        throw new Error(
          'Benchmark consumed more prepared samples than expected.',
        );
      }

      for (const tree of sample.trees) {
        if (withExistingCSS) {
          commitExistingStyles(tree);
        } else {
          generateInjectAndCommit(tree);
        }
      }
    },
    setup(mode) {
      cursor = 0;
      clearAllCaches();

      // Tinybench invokes the task once outside the sample timer to detect an
      // async return value, so the pool needs one additional prepared sample.
      const count = (mode === 'warmup' ? WARMUP_ITERATIONS : ITERATIONS) + 1;
      samples = Array.from({ length: count }, (_, sample) =>
        prepareSample(workload, sample, withExistingCSS),
      );
    },
    teardown() {
      for (const sample of samples) cleanSample(sample);

      samples = [];
      cursor = 0;
      clearAllCaches();
    },
  };
}

function validateBenchmarkContract() {
  clearAllCaches();

  const existingTree = prepareTree(ONE_RULE, 0, 0, true);
  const runtimeTree = prepareTree(ONE_RULE, 0, 0, false);

  commitExistingStyles(existingTree);
  generateInjectAndCommit(runtimeTree);

  const existingColor = getComputedStyle(existingTree.targets[0]).color;
  const runtimeColor = getComputedStyle(runtimeTree.targets[0]).color;

  cleanSample({ trees: [existingTree, runtimeTree] });
  clearAllCaches();

  if (existingColor !== runtimeColor || !runtimeColor) {
    throw new Error(
      'Existing-CSS and runtime-Tasty workloads must resolve to the same styles.',
    );
  }
}

function registerWorkload(workload: Workload) {
  describe(workload.name, () => {
    const existingCSS = createHarness(workload, true);

    bench('CSS already present: commit + style resolution', existingCSS.run, {
      ...BENCH_OPTIONS,
      setup: (_task, mode) => existingCSS.setup(mode),
      teardown: () => existingCSS.teardown(),
    });

    const runtimeTasty = createHarness(workload, false);

    bench(
      'Tasty: generate + inject + same commit + style resolution',
      runtimeTasty.run,
      {
        ...BENCH_OPTIONS,
        setup: (_task, mode) => runtimeTasty.setup(mode),
        teardown: () => runtimeTasty.teardown(),
      },
    );
  });
}

resetConfig();
configure({
  batchInjection: false,
  devMode: false,
  forceTextInjection: false,
});
validateBenchmarkContract();

describe('cold generation + injection', () => {
  registerWorkload(ONE_RULE);
  registerWorkload(ONE_THOUSAND_RULES);
});

// Keep computed-style reads observable to the optimizer.
void styleChecksum;
