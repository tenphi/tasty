import type { ReactElement } from 'react';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { bench, describe } from 'vitest';

import { TastyBatchProvider } from './batch-provider';
import { configure, resetConfig } from './config';
import { destroy, resetStyleBatch } from './injector';
import { clearPipelineCache } from './pipeline';
import { clearConditionCache } from './pipeline/materialize';
import { clearParseCache } from './pipeline/parseStateKey';
import { clearSimplifyCache } from './pipeline/simplify';
import type { Styles } from './styles/types';
import { tasty } from './tasty';
import { getGlobalParser } from './utils/styles';

/**
 * Bridges the isolated wrapper and injection benchmarks with one representative
 * React update. Every tree contains 1,000 host elements sharing 20 style
 * combinations. The three paths produce the same colors and spacing:
 *
 * 1. Raw elements switch between classes whose CSS is already on the page.
 * 2. Tasty elements switch between two style sets generated before timing.
 * 3. Tasty elements switch to 20 genuinely new style combinations per update.
 *
 * The Tasty paths use the normal component API and TastyBatchProvider. A final
 * computed-style pass gives the browser one style-resolution boundary after the
 * React commit. This is still a controlled synthetic workload, not a page-level
 * score, but it shows how wrapper, cache, generation, injection, and style
 * resolution combine when many elements share a small style vocabulary.
 */

const ITEM_COUNT = 1_000;
const STYLE_COUNT = 20;
const COLD_STYLE_SET_COUNT = 64;

const BENCH_OPTIONS = {
  iterations: 20,
  time: 0,
  warmupIterations: 5,
  warmupTime: 0,
} as const;

type TreeMode = 'static' | 'warm' | 'cold';

interface TreeHarness {
  run(): void;
  setup(): void;
  teardown(): void;
}

interface ResolvedStyle {
  color: string;
  padding: string;
  styles: Styles;
}

function colorFor(setIndex: number, styleIndex: number): string {
  const value = 1 + setIndex * STYLE_COUNT + styleIndex;

  return `rgb(${value % 256}, ${Math.floor(value / 256) % 256}, ${Math.floor(value / 65_536) % 256})`;
}

function createStyleSet(setIndex: number): ResolvedStyle[] {
  return Array.from({ length: STYLE_COUNT }, (_, styleIndex) => {
    const color = colorFor(setIndex, styleIndex);
    const padding = `${1 + (styleIndex % 4)}px`;

    return {
      color,
      padding,
      styles: Object.freeze({ color, padding }) as Styles,
    };
  });
}

const STYLE_SETS = Array.from({ length: COLD_STYLE_SET_COUNT }, (_, setIndex) =>
  createStyleSet(setIndex),
);

resetConfig();
configure({
  batchInjection: true,
  devMode: false,
  forceTextInjection: false,
});

const TreeBox = tasty({});

function clearAllCaches() {
  clearPipelineCache();
  clearParseCache();
  clearConditionCache();
  clearSimplifyCache();
  getGlobalParser().clearCache();
}

function staticClassName(setIndex: number, styleIndex: number): string {
  return `tree-static-${setIndex}-${styleIndex}`;
}

function createStaticStyleElement(): HTMLStyleElement {
  const style = document.createElement('style');

  style.textContent = STYLE_SETS.slice(0, 2)
    .flatMap((set, setIndex) =>
      set.map(
        ({ color, padding }, styleIndex) =>
          `.${staticClassName(setIndex, styleIndex)} { color: ${color}; padding: ${padding}; }`,
      ),
    )
    .join('\n');
  document.head.append(style);

  return style;
}

function createStaticTree(setIndex: number): ReactElement {
  const children = new Array<ReactElement>(ITEM_COUNT);

  for (let index = 0; index < ITEM_COUNT; index++) {
    const styleIndex = index % STYLE_COUNT;

    children[index] = createElement('div', {
      key: index,
      className: staticClassName(setIndex, styleIndex),
    });
  }

  return createElement('div', { 'data-benchmark-root': '' }, children);
}

function createTastyTree(setIndex: number): ReactElement {
  const children = new Array<ReactElement>(ITEM_COUNT);
  const styleSet = STYLE_SETS[setIndex];

  if (!styleSet) {
    throw new Error(`Missing prepared style set ${setIndex}`);
  }

  for (let index = 0; index < ITEM_COUNT; index++) {
    children[index] = createElement(TreeBox, {
      key: index,
      styles: styleSet[index % STYLE_COUNT]!.styles,
    });
  }

  return createElement(
    TastyBatchProvider,
    null,
    createElement('div', { 'data-benchmark-root': '' }, children),
  );
}

let styleChecksum = 0;

function readResolvedStyles(container: HTMLDivElement): void {
  const tree = container.firstElementChild;

  if (
    !(tree instanceof HTMLDivElement) ||
    tree.children.length !== ITEM_COUNT
  ) {
    throw new Error('Representative tree benchmark rendered an invalid tree');
  }

  for (const child of tree.children) {
    const computed = getComputedStyle(child);
    styleChecksum += computed.color.length + computed.paddingLeft.length;
  }
}

function assertFirstStyle(container: HTMLDivElement, setIndex: number): void {
  const first = container.firstElementChild?.firstElementChild;

  if (!(first instanceof HTMLDivElement)) {
    throw new Error('Representative tree benchmark rendered no first item');
  }

  const computed = getComputedStyle(first);
  const expected = STYLE_SETS[setIndex]?.[0];

  if (
    !expected ||
    computed.color !== expected.color ||
    computed.paddingLeft !== expected.padding
  ) {
    throw new Error(
      `Representative tree styles differ: ${computed.color}/${computed.paddingLeft}`,
    );
  }
}

function createHarness(mode: TreeMode): TreeHarness {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;
  let staticStyle: HTMLStyleElement | undefined;
  let setIndex = 0;

  function render(nextSetIndex: number) {
    if (!root || !container) {
      throw new Error('Representative tree benchmark was not initialized');
    }

    flushSync(() =>
      root!.render(
        mode === 'static'
          ? createStaticTree(nextSetIndex)
          : createTastyTree(nextSetIndex),
      ),
    );
    readResolvedStyles(container);
  }

  return {
    run() {
      if (mode === 'cold') {
        setIndex += 1;
      } else {
        setIndex = setIndex === 0 ? 1 : 0;
      }

      render(setIndex);
    },
    setup() {
      destroy();
      resetStyleBatch();
      clearAllCaches();

      container = document.createElement('div');
      document.body.append(container);
      root = createRoot(container);

      if (mode === 'static') {
        staticStyle = createStaticStyleElement();
        setIndex = 0;
        render(setIndex);
      } else if (mode === 'warm') {
        render(0);
        render(1);
        setIndex = 0;
        render(setIndex);
      } else {
        setIndex = 1;
        render(setIndex);
      }

      assertFirstStyle(container, setIndex);
    },
    teardown() {
      if (root) flushSync(() => root!.unmount());
      container?.remove();
      staticStyle?.remove();

      root = undefined;
      container = undefined;
      staticStyle = undefined;
      setIndex = 0;

      destroy();
      resetStyleBatch();
      clearAllCaches();
    },
  };
}

describe(`representative React update (${ITEM_COUNT.toLocaleString()} elements, ${STYLE_COUNT} shared styles)`, () => {
  const staticCSS = createHarness('static');

  bench('CSS already present', staticCSS.run, {
    ...BENCH_OPTIONS,
    setup: staticCSS.setup,
    teardown: staticCSS.teardown,
  });

  const warmTasty = createHarness('warm');

  bench('Tasty: shared styles already cached', warmTasty.run, {
    ...BENCH_OPTIONS,
    setup: warmTasty.setup,
    teardown: warmTasty.teardown,
  });

  const coldTasty = createHarness('cold');

  bench('Tasty: 20 new shared styles', coldTasty.run, {
    ...BENCH_OPTIONS,
    setup: coldTasty.setup,
    teardown: coldTasty.teardown,
  });
});

// Keep computed-style reads observable to the optimizer.
void styleChecksum;
