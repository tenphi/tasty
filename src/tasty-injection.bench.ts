import { bench, describe } from 'vitest';

import { computeStyles } from './compute-styles';
import { configure, getNamePrefix, resetConfig } from './config';
import { tastyDebug } from './debug';
import { destroy } from './injector';
import { clearPipelineCache } from './pipeline';
import { clearConditionCache } from './pipeline/materialize';
import { clearParseCache } from './pipeline/parseStateKey';
import { clearSimplifyCache } from './pipeline/simplify';
import type { Styles } from './styles/types';
import { getGlobalParser } from './utils/styles';
import { registerTastyPrecompiled } from './precompile/register';
import { beginPrecompileBuild, endPrecompileBuild } from './precompile/runtime';
import type {
  TastyPrecompiledChunk,
  TastyPrecompiledDependencies,
} from './precompile/types';
import { ServerStyleCollector } from './ssr/collector';
import { captureCompilationConfig } from './precompile/fingerprint';
import { TASTY_VERSION } from './version';

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

const PRECOMPILED_RULES: Workload = {
  ...ONE_THOUSAND_RULES,
  name: '1,000 precompiled rules together (one transaction per sample)',
  // Keep these lookup keys disjoint from the cold-runtime benchmark even if
  // Tinybench prepares multiple tasks before running their samples.
  valueOffset: 1_000_000,
};

/** One rule, disjoint from every workload above, for the contract check. */
const PRECOMPILED_CONTRACT: Workload = {
  ...ONE_RULE,
  name: 'precompiled contract',
  valueOffset: 2_000_000,
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

interface PreparedPrecompiledSample {
  container: HTMLDivElement;
  fragment: DocumentFragment;
  styles: Styles[];
  targets: HTMLDivElement[];
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

function configureBenchmarkRuntime() {
  resetConfig();
  configure({
    batchInjection: false,
    devMode: false,
    forceTextInjection: false,
  });
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

/**
 * Build one sample's styles and the catalog CSS that covers them.
 *
 * Everything stays in the main document. A catalog's CSS lives in exactly one
 * document — the one `installTastyPrecompiled()` appends its `<style>` to — so
 * a precompiled lookup only returns a class name for that document. Preparing
 * these samples in per-sample iframes, as an earlier revision did, silently
 * turned every lookup into a miss and left this task measuring the very
 * runtime path it exists to be compared against. `validatePrecompiledContract`
 * below now fails loudly if that ever happens again.
 */
function preparePrecompiledSample(
  workload: Workload,
  sample: number,
): {
  sample: PreparedPrecompiledSample;
  chunks: TastyPrecompiledChunk[];
  css: string;
} {
  const styles = Array.from(
    { length: workload.rulesPerTransaction },
    (_, index) =>
      Object.freeze({
        color: colorFor(workload, sample, 0, index),
      }) as Styles,
  );

  return {
    sample: {
      container: document.createElement('div'),
      fragment: document.createDocumentFragment(),
      styles,
      targets: Array.from({ length: workload.rulesPerTransaction }, () =>
        document.createElement('div'),
      ),
    },
    ...compileCatalogFor(styles),
  };
}

/** Compile `styles` the way a build-time catalog would, off the live runtime. */
function compileCatalogFor(styles: readonly Styles[]): {
  chunks: TastyPrecompiledChunk[];
  css: string;
} {
  const collector = new ServerStyleCollector();
  collector.enablePrecompileRecording();
  beginPrecompileBuild();
  try {
    for (const value of styles) {
      computeStyles(value, { ssrCollector: collector });
    }
  } finally {
    endPrecompileBuild();
  }

  return {
    chunks: collector.getPrecompiledChunks(),
    css: collector
      .getArtifacts()
      .filter(({ source }) => source === 'component')
      .map(({ css }) => css)
      .join('\n'),
  };
}

function registerCatalog(
  chunks: TastyPrecompiledChunk[],
  cssHash: string,
): void {
  const dependencies: TastyPrecompiledDependencies = {
    properties: [],
    keyframes: [],
    fontFaces: [],
    counterStyles: [],
    functions: [],
    rscKeys: [],
  };
  registerTastyPrecompiled({
    schemaVersion: 2,
    id: '@tenphi/tasty/injection-benchmark',
    tastyVersion: TASTY_VERSION,
    namePrefix: getNamePrefix(),
    cssHash,
    // The benchmark configures the runtime it measures, so the live
    // configuration is by definition the one this catalog was built under.
    compilationConfig: captureCompilationConfig(),
    stats: { cssSize: 0, ruleCount: 0 },
    chunks,
    dependencies,
  });
}

function installCatalogCSS(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);

  return style;
}

function createPrecompiledHarness(workload: Workload): BenchmarkHarness {
  let cursor = 0;
  let samples: PreparedPrecompiledSample[] = [];
  let catalog: HTMLStyleElement | null = null;

  return {
    run() {
      const sample = samples[cursor++];
      if (!sample) {
        throw new Error(
          'Benchmark consumed more prepared samples than expected.',
        );
      }

      for (let index = 0; index < sample.targets.length; index++) {
        const target = sample.targets[index];
        target.className = computeStyles(sample.styles[index]).className;
        sample.fragment.append(target);
      }
      sample.container.append(sample.fragment);
      document.body.append(sample.container);
      readComputedColors(sample.targets);
    },
    setup(mode) {
      cursor = 0;
      clearAllCaches();
      configureBenchmarkRuntime();

      const count = (mode === 'warmup' ? WARMUP_ITERATIONS : ITERATIONS) + 1;
      const chunks = new Map<string, TastyPrecompiledChunk>();
      const css: string[] = [];
      samples = Array.from({ length: count }, (_, sampleIndex) => {
        const prepared = preparePrecompiledSample(workload, sampleIndex);
        for (const chunk of prepared.chunks) {
          chunks.set(chunk.lookupKey, chunk);
        }
        css.push(prepared.css);
        return prepared.sample;
      });

      // One stylesheet for every sample, which is what a catalog is: a single
      // prebuilt asset covering the whole application. It makes this task the
      // conservative one of the three — its 1,000 elements resolve against
      // every sample's rules, while each control resolves against the 1,000
      // in its own shadow root — so the measured advantage is a floor.
      catalog = installCatalogCSS(css.join('\n'));
      registerCatalog([...chunks.values()], `${mode}-${count}`);
    },
    teardown() {
      for (const sample of samples) sample.container.remove();
      catalog?.remove();
      catalog = null;
      samples = [];
      cursor = 0;
      configureBenchmarkRuntime();
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

/**
 * Fail the run if the precompiled task is not actually hitting the catalog.
 *
 * Without this the task degrades silently. A lookup that misses still produces
 * a working class name and the right computed color, because a runtime class
 * name is `hashString(cacheKey)` — the very string the catalog recorded — so
 * neither the name nor the rendering can tell a hit from a miss. What differs
 * is only whether the rule was generated and injected, which is the entire
 * thing this task exists to measure the absence of. So the assertion reads the
 * injector's own hit counter, which requires `devMode`; the benchmark runtime
 * is restored before any timing.
 *
 * Its own value offset keeps these lookup keys disjoint from the harness pool.
 */
function validatePrecompiledContract() {
  resetConfig();
  configure({
    batchInjection: false,
    devMode: true,
    forceTextInjection: false,
  });
  clearAllCaches();

  const styles = [
    Object.freeze({ color: colorFor(PRECOMPILED_CONTRACT, 0, 0, 0) }) as Styles,
  ];
  const { chunks, css } = compileCatalogFor(styles);
  const style = installCatalogCSS(css);
  registerCatalog(chunks, 'contract');

  const target = document.createElement('div');
  target.className = computeStyles(styles[0]).className;
  document.body.append(target);
  const color = getComputedStyle(target).color;
  const { metrics } = tastyDebug.summary({ raw: true });

  target.remove();
  style.remove();
  configureBenchmarkRuntime();
  clearAllCaches();

  if (!metrics?.precompiledHits) {
    throw new Error(
      'The precompiled workload is not hitting the catalog, so it would measure runtime generation instead.',
    );
  }
  if (metrics.misses) {
    throw new Error(
      `The precompiled workload generated ${metrics.misses} rule(s) at runtime; every chunk it measures must come from the catalog.`,
    );
  }
  if (!color) {
    throw new Error('The precompiled catalog CSS did not apply to the target.');
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

configureBenchmarkRuntime();
validateBenchmarkContract();
validatePrecompiledContract();

describe('cold generation + injection', () => {
  registerWorkload(ONE_RULE);
  registerWorkload(ONE_THOUSAND_RULES);

  const precompiled = createPrecompiledHarness(PRECOMPILED_RULES);
  bench(
    'Precompiled Tasty: lookup + same commit + style resolution',
    precompiled.run,
    {
      ...BENCH_OPTIONS,
      setup: (_task, mode) => precompiled.setup(mode),
      teardown: () => precompiled.teardown(),
    },
  );
});

// Keep computed-style reads observable to the optimizer.
void styleChecksum;
