import { bench, describe } from 'vitest';

import { clearConditionCache } from './materialize';
import { clearParseCache } from './parseStateKey';
import { clearPipelineCache, renderStyles } from './index';
import { clearSimplifyCache } from './simplify';
import type { Styles } from '../styles/types';

function clearAllCaches() {
  clearPipelineCache();
  clearParseCache();
  clearConditionCache();
  clearSimplifyCache();
}

const POOL_SIZE = 6000;
let idx = 0;

function makeSimplePool(n: number): Styles[] {
  return Array.from({ length: n }, (_, i) => ({
    display: 'flex',
    flow: 'column',
    padding: `${i}px`,
    gap: `${i + 1}px`,
    fill: '#surface',
  }));
}

function makeComplexPool(n: number): Styles[] {
  return Array.from({ length: n }, (_, i) => ({
    padding: {
      '': `${i}px`,
      '@media(width < 768px)': `${i + 1}px`,
    },
    fill: {
      '': '#surface',
      ':hover': `#primary-${i}`,
      disabled: `#muted-${i}`,
    },
    color: {
      '': '#text',
      '@root(schema=dark)': `#text-dark-${i}`,
    },
    border: `${(i % 4) + 1}bw solid #border`,
    radius: '1r',
  }));
}

function makeMixedOrPool(n: number): Styles[] {
  return Array.from({ length: n }, (_, i) => ({
    display: {
      '': 'block',
      '@supports(display: grid) & hovered': 'grid',
      '@media(w < 700px) | focused': i % 2 ? 'flex' : 'inline-flex',
    },
    color: {
      '': '#text',
      '@supports(container-type: scroll-state) & @(scroll-state(scrolled: block-end))': `#text-${i}`,
    },
  }));
}

const simplePool = makeSimplePool(POOL_SIZE);
const complexPool = makeComplexPool(POOL_SIZE);
const mixedOrPool = makeMixedOrPool(POOL_SIZE);

const cachedComplexStyles: Styles = {
  padding: {
    '': '4x',
    '@media(width < 768px)': '2x',
  },
  fill: {
    '': '#surface',
    ':hover': '#primary',
    disabled: '#muted',
  },
  color: {
    '': '#text',
    '@root(schema=dark)': '#text-dark',
  },
  border: '1bw solid #border',
  radius: '1r',
};

renderStyles(cachedComplexStyles);

describe('renderStyles', () => {
  bench(
    'simple styles (5 properties, cold)',
    () => {
      renderStyles(simplePool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        clearAllCaches();
        idx = 0;
      },
    },
  );

  bench(
    'complex state map (cold)',
    () => {
      renderStyles(complexPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        clearAllCaches();
        idx = 0;
      },
    },
  );

  bench(
    'mixed OR state map (cold)',
    () => {
      renderStyles(mixedOrPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        clearAllCaches();
        idx = 0;
      },
    },
  );

  bench('complex state map (cached)', () => {
    renderStyles(cachedComplexStyles);
  });
});
