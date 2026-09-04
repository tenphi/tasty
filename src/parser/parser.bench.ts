import { bench, describe } from 'vitest';

import { getGlobalParser, parseStyle } from '../utils/styles';

const POOL_SIZE = 2000;
let idx = 0;

function makeValuePool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `${i}px ${i + 1}px ${i + 2}px ${i + 3}px`,
  );
}

function makeColorPool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `#color-${i}.${(50 + (i % 50)) / 100}`,
  );
}

function makeMixedPool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) => `0 ${i}px ${i + 1}px #shadow-${i}`,
  );
}

function makeLayeredPool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `url("/img-${i},x.png") no-repeat center / ${i + 10}px ${i + 20}px, ` +
      `linear-gradient(45deg, #shade-${i}, transparent)`,
  );
}

function makeGroupedPool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `${i}px solid #border-${i} / ${i + 1}px dashed #accent-${i}, ${i + 2}px`,
  );
}

const valuePool = makeValuePool(POOL_SIZE);
const colorPool = makeColorPool(POOL_SIZE);
const mixedPool = makeMixedPool(POOL_SIZE);
const layeredPool = makeLayeredPool(POOL_SIZE);
const groupedPool = makeGroupedPool(POOL_SIZE);

parseStyle('2x 4x');

describe('parseStyle', () => {
  bench(
    'spacing values (cold)',
    () => {
      parseStyle(valuePool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        getGlobalParser().clearCache();
        idx = 0;
      },
    },
  );

  bench('spacing values (cached)', () => {
    parseStyle('2x 4x');
  });

  bench(
    'color tokens (cold)',
    () => {
      parseStyle(colorPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        getGlobalParser().clearCache();
        idx = 0;
      },
    },
  );

  bench(
    'mixed values (cold)',
    () => {
      parseStyle(mixedPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        getGlobalParser().clearCache();
        idx = 0;
      },
    },
  );

  bench(
    'layered functions (cold)',
    () => {
      parseStyle(layeredPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        getGlobalParser().clearCache();
        idx = 0;
      },
    },
  );

  bench(
    'comma and slash groups (cold)',
    () => {
      parseStyle(groupedPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        getGlobalParser().clearCache();
        idx = 0;
      },
    },
  );
});
