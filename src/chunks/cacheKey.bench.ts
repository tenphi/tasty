import { bench, describe } from 'vitest';

import type { Styles } from '../styles/types';
import { categorizeStyleKeys } from './definitions';
import { generateChunkCacheKey } from './cacheKey';

const POOL_SIZE = 4000;

function makeStyles(i: number): Styles {
  return {
    display: 'flex',
    flow: 'column',
    padding: `${i}px`,
    gap: `${i + 1}px`,
    fill: {
      '': '#surface',
      ':hover': `#primary-${i}`,
      disabled: '#muted',
    },
    color: {
      '': '#text',
      '@root(schema=dark)': '#text-dark',
    },
    border: '1bw solid #border',
    radius: '1r',
  } as Styles;
}

/** Same shape, plus a local predefined state referenced by one of the chunks. */
function makeStylesWithLocalStates(i: number): Styles {
  return {
    ...(makeStyles(i) as Record<string, unknown>),
    '@active': ':hover, :focus-visible',
    preset: { '': 't3', '@active': 't3m' },
  } as Styles;
}

interface Entry {
  styles: Styles;
  chunks: [string, string[]][];
}

function toEntry(styles: Styles): Entry {
  return {
    styles,
    chunks: Array.from(
      categorizeStyleKeys(styles as Record<string, unknown>),
    ) as [string, string[]][],
  };
}

// A rotating pool of distinct styles objects. Callers copy one per iteration,
// which is the shape `mergeStyles()` produces for a component with instance
// styles: a fresh top-level object whose nested values keep their identity.
// This is the dominant client render path, so it is the one to protect.
const pool: Entry[] = Array.from({ length: POOL_SIZE }, (_, i) =>
  toEntry(makeStyles(i)),
);
const localStatePool: Styles[] = Array.from({ length: POOL_SIZE }, (_, i) =>
  makeStylesWithLocalStates(i),
);

// One stable object, the shape a `tasty({ styles })` definition produces.
const warm = toEntry(makeStyles(0));
const warmWithStates = toEntry(makeStylesWithLocalStates(0));
// Separate objects for the memoized rows, so opting in cannot alter the
// baseline rows through the shared cache.
const warmMemo = toEntry(makeStyles(1));
const warmStatesMemo = toEntry(makeStylesWithLocalStates(1));

for (const [chunkName, styleKeys] of warm.chunks) {
  generateChunkCacheKey(warm.styles, chunkName, styleKeys);
}
for (const [chunkName, styleKeys] of warmWithStates.chunks) {
  generateChunkCacheKey(warmWithStates.styles, chunkName, styleKeys);
}
keyAllChunks(warmMemo, true);
keyAllChunks(warmStatesMemo, true);

function keyAllChunks(entry: Entry, reusable = false) {
  for (const [chunkName, styleKeys] of entry.chunks) {
    generateChunkCacheKey(entry.styles, chunkName, styleKeys, reusable);
  }
}

let idx = 0;

function freshCopy(): Entry {
  const entry = pool[idx++ % POOL_SIZE];
  return {
    styles: { ...(entry.styles as Record<string, unknown>) } as Styles,
    chunks: entry.chunks,
  };
}

describe('categorizeStyleKeys', () => {
  bench('typical component styles', () => {
    categorizeStyleKeys(
      pool[idx++ % POOL_SIZE].styles as Record<string, unknown>,
    );
  });

  bench('component styles with local states', () => {
    categorizeStyleKeys(
      localStatePool[idx++ % POOL_SIZE] as Record<string, unknown>,
    );
  });
});

describe('generateChunkCacheKey', () => {
  bench('all chunks (fresh styles object every call)', () => {
    keyAllChunks(freshCopy());
  });

  // The shape a write-only opt-in has: an object keyed once, stored, and never
  // looked up again — what the client would pay if `tasty()` opted in on the
  // single render that reaches computeStyles before classNameCache takes over.
  // The gap to the row above is exactly what that mistake costs.
  bench(
    'all chunks (fresh styles object every call, stored but never read)',
    () => {
      keyAllChunks(freshCopy(), true);
    },
  );

  // A styles object that survives across renders — what SSR sees on every
  // render of a `tasty({ styles })` definition, since the client-side
  // `classNameCache` in tasty.tsx is disabled on the server. Only these
  // callers opt into the memo.
  bench('all chunks (stable styles object)', () => {
    keyAllChunks(warm);
  });

  bench('all chunks (stable styles object, memoized)', () => {
    keyAllChunks(warmMemo, true);
  });

  bench('all chunks (stable styles object with local states)', () => {
    keyAllChunks(warmWithStates);
  });

  bench('all chunks (stable styles object with local states, memoized)', () => {
    keyAllChunks(warmStatesMemo, true);
  });
});
