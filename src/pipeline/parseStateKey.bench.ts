import { test } from 'vitest';

import { clearParseCache, parseStateKey } from './parseStateKey';

const POOL_SIZE = 6000;
let idx = 0;

function makeSimplePool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `mod-${i}`);
}

function makeComplexPool(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `@root(schema=s${i}) | (!@root(schema) & @media(min-width: ${600 + i}px))`,
  );
}

function makeValuePool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `variant-${i}=value-${i}`);
}

const simplePool = makeSimplePool(POOL_SIZE);
const complexPool = makeComplexPool(POOL_SIZE);
const valuePool = makeValuePool(POOL_SIZE);

parseStateKey(':hover');
parseStateKey(
  '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
);

test('parseStateKey', async ({ bench }) => {
  await bench.compare(
    bench(
      'simple key (cold)',
      {
        beforeAll() {
          clearParseCache();
          idx = 0;
        },
      },
      () => {
        parseStateKey(simplePool[idx++ % POOL_SIZE]);
      },
    ),

    bench('simple key (cached)', () => {
      parseStateKey(':hover');
    }),

    bench(
      'value modifier (cold)',
      {
        beforeAll() {
          clearParseCache();
          idx = 0;
        },
      },
      () => {
        parseStateKey(valuePool[idx++ % POOL_SIZE]);
      },
    ),

    bench(
      'complex key (cold)',
      {
        beforeAll() {
          clearParseCache();
          idx = 0;
        },
      },
      () => {
        parseStateKey(complexPool[idx++ % POOL_SIZE]);
      },
    ),

    bench('complex key (cached)', () => {
      parseStateKey(
        '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
      );
    }),
  );
});
