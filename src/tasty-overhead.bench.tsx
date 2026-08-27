import type { ElementType, ReactElement } from 'react';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { bench, describe } from 'vitest';

import { tasty } from './tasty';

/**
 * Measures the current empty-wrapper cost of the tasty() abstraction when it
 * has no styling work to do. Both cases receive the same props and produce the
 * same DOM; the only variable is a raw host element versus the component
 * returned by tasty({}).
 *
 * The trees are deliberately detached from document. This keeps layout,
 * paint, stylesheet matching, and browser rendering out of the result. Each
 * operation batches enough siblings to rise well above Chromium's timer
 * resolution. Divide the raw/tasty delta by ITEM_COUNT to estimate the average
 * wrapper cost per element for this exact workload.
 *
 * The contract check below also warms the module-scoped component's empty
 * class-name cache before Tinybench starts. Factory creation and style
 * generation are therefore outside the timed samples. flushSync keeps each
 * complete reconciliation and commit inside its sample; this measures
 * synchronous CPU work, not React's concurrent scheduling latency.
 */

const ITEM_COUNT = 10_000;
const ITEM_CLASS_NAME = 'tasty-overhead-item';
const EmptyTastyDiv = tasty({});

const BENCH_OPTIONS = {
  iterations: 20,
  time: 2_000,
  warmupIterations: 5,
  warmupTime: 500,
} as const;

function createTree(
  Element: ElementType,
  version?: number,
  count = ITEM_COUNT,
): ReactElement {
  const children = new Array<ReactElement>(count);

  for (let index = 0; index < count; index++) {
    children[index] = createElement(Element, {
      key: index,
      className: ITEM_CLASS_NAME,
      ...(version === undefined ? null : { 'data-version': version }),
    });
  }

  return createElement('div', { 'data-benchmark-root': '' }, children);
}

function renderTree(elementType: ElementType): Element {
  const container = document.createElement('div');
  const root = createRoot(container);

  flushSync(() => root.render(createTree(elementType, 0, 2)));
  const tree = container.firstElementChild?.cloneNode(true);
  flushSync(() => root.unmount());

  if (!(tree instanceof Element)) {
    throw new Error('Benchmark did not render an element tree');
  }

  return tree;
}

function validateBenchmarkContract() {
  // React freezes elements only in development. Development-only validation
  // would distort this small differential and is not what applications ship.
  if (Object.isFrozen(createElement('div'))) {
    throw new Error(
      'The wrapper-overhead benchmark must run with production React. ' +
        'Use pnpm bench:overhead.',
    );
  }

  const rawTree = renderTree('div');
  const tastyTree = renderTree(EmptyTastyDiv);

  // Attribute order follows props-object insertion order and is irrelevant to
  // DOM equivalence, so compare nodes rather than serialized markup.
  if (!rawTree.isEqualNode(tastyTree)) {
    throw new Error(
      'Benchmark inputs no longer produce identical DOM.\n' +
        `Raw:   ${rawTree.outerHTML}\n` +
        `Tasty: ${tastyTree.outerHTML}`,
    );
  }
}

validateBenchmarkContract();

function benchmarkUpdate(
  name: string,
  Element: ElementType,
  changeHostProp: boolean,
) {
  let root: Root | undefined;
  let version = 0;

  bench(
    name,
    () => {
      if (!root) throw new Error('Benchmark root was not initialized');

      if (changeHostProp) version = version === 0 ? 1 : 0;
      const nextVersion = changeHostProp ? version : undefined;

      flushSync(() => root!.render(createTree(Element, nextVersion)));
    },
    {
      ...BENCH_OPTIONS,
      setup() {
        root = createRoot(document.createElement('div'));
        version = 0;
        flushSync(() =>
          root!.render(
            createTree(Element, changeHostProp ? version : undefined),
          ),
        );
      },
      teardown() {
        if (root) flushSync(() => root!.unmount());
        root = undefined;
      },
    },
  );
}

describe(`empty wrapper lifecycle (${ITEM_COUNT.toLocaleString()} siblings)`, () => {
  bench(
    'raw <div className> mount + remove',
    () => {
      const root = createRoot(document.createElement('div'));
      flushSync(() => root.render(createTree('div')));
      flushSync(() => root.unmount());
    },
    BENCH_OPTIONS,
  );

  bench(
    'tasty({}) mount + remove',
    () => {
      const root = createRoot(document.createElement('div'));
      flushSync(() => root.render(createTree(EmptyTastyDiv)));
      flushSync(() => root.unmount());
    },
    BENCH_OPTIONS,
  );
});

describe(`empty wrapper same-props update (${ITEM_COUNT.toLocaleString()} siblings)`, () => {
  benchmarkUpdate('raw <div className>', 'div', false);
  benchmarkUpdate('tasty({})', EmptyTastyDiv, false);
});

describe(`empty wrapper host-prop update (${ITEM_COUNT.toLocaleString()} siblings)`, () => {
  benchmarkUpdate('raw <div className>', 'div', true);
  benchmarkUpdate('tasty({})', EmptyTastyDiv, true);
});
