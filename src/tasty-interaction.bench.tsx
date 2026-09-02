import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { createElement, memo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { bench, describe } from 'vitest';

import { TastyBatchProvider } from './batch-provider';
import { configure, resetConfig } from './config';
import { destroy, resetStyleBatch } from './injector';
import { tasty } from './tasty';

/**
 * What a styled application costs *after* it has loaded.
 *
 * The other React benchmarks here measure mounting and whole-tree updates with
 * changing `styles` props. A running application spends most of its time on
 * neither: it flips mods — hovered, pressed, selected, expanded — on elements
 * whose styles never change, usually one element at a time, and it mounts and
 * unmounts small styled subtrees as menus and dialogs open. Those paths go
 * through the state-map and ref-counting machinery rather than the parser, so
 * a regression in them is invisible to every other benchmark in this file set.
 *
 * Each case is paired with a raw-DOM equivalent that produces the same computed
 * styles from a hand-written stylesheet, so the number to read is the delta.
 * Trees are attached to the document because a mod flip is only meaningful once
 * the browser resolves it; `flushSync` keeps each reconciliation and commit
 * inside its own sample.
 */

const TREE_SIZE = 1_000;
const SUBTREE_SIZE = 200;
/**
 * One toggle is far below Chromium's 0.1 ms timer resolution, so a sample
 * performs this many independent single-element interactions — each its own
 * commit and its own style resolution — and the per-interaction cost is the
 * raw/Tasty difference divided by this number.
 */
const TOGGLES_PER_SAMPLE = 100;
/** Same reason: one open-and-close of a 200-element subtree is ~0.4 ms. */
const CHURN_CYCLES = 10;

const BENCH_OPTIONS = {
  iterations: 20,
  time: 0,
  warmupIterations: 5,
  warmupTime: 0,
} as const;

const REST_COLOR = 'rgb(18, 18, 31)';
const HOVER_COLOR = 'rgb(123, 97, 255)';
const REST_FILL = 'rgb(255, 255, 255)';
const HOVER_FILL = 'rgb(240, 238, 255)';

resetConfig();
configure({ batchInjection: true, devMode: false });

const Row = tasty({
  styles: {
    display: 'block',
    padding: '1x',
    color: { '': REST_COLOR, hovered: HOVER_COLOR },
    fill: { '': REST_FILL, hovered: HOVER_FILL },
  },
});

const RAW_CSS = `
.bench-row { display: block; padding: 4px; color: ${REST_COLOR}; background-color: ${REST_FILL}; }
.bench-row.is-hovered { color: ${HOVER_COLOR}; background-color: ${HOVER_FILL}; }
`;

// ---------------------------------------------------------------------------
// Leaves that re-render on their own, so a single interaction stays single
// ---------------------------------------------------------------------------

type Toggle = Dispatch<SetStateAction<boolean>>;
type Publish = (index: number, toggle: Toggle) => void;

/**
 * React reconciles whatever the render call produces, so re-rendering the root
 * to flip one element would time 1,000 elements. Each leaf owns its state and
 * publishes its setter, which is what lets the single-element case measure the
 * one element the user actually interacted with.
 */
function makeLeaf(kind: 'raw' | 'tasty') {
  return memo(function Leaf({
    index,
    publish,
  }: {
    index: number;
    publish?: Publish;
  }) {
    const [hovered, setHovered] = useState(false);
    if (publish) publish(index, setHovered);

    return kind === 'raw'
      ? createElement('div', {
          className: hovered ? 'bench-row is-hovered' : 'bench-row',
        })
      : createElement(Row, { mods: { hovered } });
  });
}

const RawLeaf = makeLeaf('raw');
const TastyLeaf = makeLeaf('tasty');

function createTree(
  kind: 'raw' | 'tasty',
  count: number,
  publish?: Publish,
): ReactElement {
  const Leaf = kind === 'raw' ? RawLeaf : TastyLeaf;
  const children = new Array<ReactElement>(count);

  for (let index = 0; index < count; index++) {
    children[index] = createElement(Leaf, { key: index, index, publish });
  }

  const tree = createElement('div', { 'data-benchmark-root': '' }, children);

  return kind === 'raw' ? tree : createElement(TastyBatchProvider, null, tree);
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  toggles: Toggle[];
}

function mount(kind: 'raw' | 'tasty', count: number): Mounted {
  const container = document.createElement('div');
  document.body.append(container);

  const root = createRoot(container);
  const toggles: Toggle[] = [];

  flushSync(() =>
    root.render(
      createTree(kind, count, (index, toggle) => {
        toggles[index] = toggle;
      }),
    ),
  );

  if (!toggles[0]) {
    throw new Error('Interaction benchmark leaf never published its setter');
  }

  return { container, root, toggles };
}

function unmount({ container, root }: Mounted): void {
  flushSync(() => root.unmount());
  container.remove();
}

function rowAt(container: HTMLDivElement, index: number): HTMLElement {
  const row = container.querySelectorAll('[data-benchmark-root] > *')[index];
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Interaction benchmark rendered no row ${index}`);
  }

  return row;
}

/**
 * Both trees must resolve to the same colors in both states, or the delta is
 * measuring different work rather than the same work done two ways. An
 * unstyled element computes to `rgb(0, 0, 0)` and a transparent background, so
 * the rest state is checked against the expected values, not merely against
 * the hovered one.
 */
function validateBenchmarkContract(): void {
  // React freezes elements only in development, which would distort a
  // differential this small.
  if (Object.isFrozen(createElement('div'))) {
    throw new Error(
      'The interaction benchmark must run with production React. ' +
        'Use pnpm bench:interaction.',
    );
  }

  const style = document.createElement('style');
  style.textContent = RAW_CSS;
  document.head.append(style);

  const observed: Record<string, { rest: string; hovered: string }> = {};

  for (const kind of ['raw', 'tasty'] as const) {
    const mounted = mount(kind, 2);
    const row = rowAt(mounted.container, 0);
    const rest = `${getComputedStyle(row).color} / ${getComputedStyle(row).backgroundColor}`;

    flushSync(() => mounted.toggles[0]!(true));
    const hovered = `${getComputedStyle(row).color} / ${getComputedStyle(row).backgroundColor}`;

    observed[kind] = { rest, hovered };
    unmount(mounted);
  }

  style.remove();
  destroy();
  resetStyleBatch();

  const expectedRest = `${REST_COLOR} / ${REST_FILL}`;
  const expectedHovered = `${HOVER_COLOR} / ${HOVER_FILL}`;

  for (const [kind, { rest, hovered }] of Object.entries(observed)) {
    if (rest !== expectedRest || hovered !== expectedHovered) {
      throw new Error(
        `${kind} rows do not resolve to the benchmark's colors.\n` +
          `  rest:    ${rest} (expected ${expectedRest})\n` +
          `  hovered: ${hovered} (expected ${expectedHovered})`,
      );
    }
  }
}

validateBenchmarkContract();

// ---------------------------------------------------------------------------
// Harnesses
// ---------------------------------------------------------------------------

let checksum = 0;

/** One element flips, inside a tree that does not: a hover, a press, a focus. */
function benchmarkSingleToggle(name: string, kind: 'raw' | 'tasty') {
  let mounted: Mounted | undefined;
  let hovered = false;
  let style: HTMLStyleElement | undefined;

  bench(
    name,
    () => {
      if (!mounted) throw new Error('Benchmark tree was not initialized');
      hovered = !hovered;

      for (let index = 0; index < TOGGLES_PER_SAMPLE; index++) {
        flushSync(() => mounted!.toggles[index]!(hovered));
        // Resolve each interaction before the next one, the way a frame would.
        // Leaving them all to one final read would let the browser coalesce
        // work an interaction never gets to coalesce.
        checksum += getComputedStyle(rowAt(mounted.container, index)).color
          .length;
      }
    },
    {
      ...BENCH_OPTIONS,
      setup() {
        if (kind === 'raw') {
          style = document.createElement('style');
          style.textContent = RAW_CSS;
          document.head.append(style);
        }
        mounted = mount(kind, TREE_SIZE);
        hovered = false;
      },
      teardown() {
        if (mounted) unmount(mounted);
        mounted = undefined;
        style?.remove();
        style = undefined;
        destroy();
        resetStyleBatch();
      },
    },
  );
}

/** A styled subtree opening and closing, the way a menu or dialog does. */
function benchmarkSubtreeChurn(name: string, kind: 'raw' | 'tasty') {
  let style: HTMLStyleElement | undefined;

  bench(
    name,
    () => {
      for (let cycle = 0; cycle < CHURN_CYCLES; cycle++) {
        const mounted = mount(kind, SUBTREE_SIZE);
        checksum += getComputedStyle(rowAt(mounted.container, 0)).color.length;
        unmount(mounted);
      }
    },
    {
      ...BENCH_OPTIONS,
      setup() {
        if (kind === 'raw') {
          style = document.createElement('style');
          style.textContent = RAW_CSS;
          document.head.append(style);
        }
        // The first mount generates and injects the CSS. Every sample after it
        // reuses the cache, which is what reopening a menu actually does — so
        // pay that cost here rather than inside the first sample.
        unmount(mount(kind, 2));
      },
      teardown() {
        style?.remove();
        style = undefined;
        destroy();
        resetStyleBatch();
      },
    },
  );
}

describe(`${TOGGLES_PER_SAMPLE} single-element mod toggles (inside ${TREE_SIZE.toLocaleString()} elements)`, () => {
  benchmarkSingleToggle('raw className toggle', 'raw');
  benchmarkSingleToggle('tasty mods toggle', 'tasty');
});

describe(`${CHURN_CYCLES} styled subtree mount + unmount cycles (${SUBTREE_SIZE} elements, CSS cached)`, () => {
  benchmarkSubtreeChurn('raw className', 'raw');
  benchmarkSubtreeChurn('tasty mods', 'tasty');
});

// Keep the computed-style reads observable to the optimizer.
void checksum;
