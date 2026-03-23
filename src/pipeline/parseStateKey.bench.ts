import { bench, describe } from 'vitest';

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

const simplePool = makeSimplePool(POOL_SIZE);
const complexPool = makeComplexPool(POOL_SIZE);

parseStateKey(':hover');
parseStateKey(
  '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
);

describe('parseStateKey', () => {
  bench(
    'simple key (cold)',
    () => {
      parseStateKey(simplePool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        clearParseCache();
        idx = 0;
      },
    },
  );

  bench('simple key (cached)', () => {
    parseStateKey(':hover');
  });

  bench(
    'complex key (cold)',
    () => {
      parseStateKey(complexPool[idx++ % POOL_SIZE]);
    },
    {
      setup() {
        clearParseCache();
        idx = 0;
      },
    },
  );

  bench('complex key (cached)', () => {
    parseStateKey(
      '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
    );
  });
});
