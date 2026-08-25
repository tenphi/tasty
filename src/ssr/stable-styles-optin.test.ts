/**
 * `stableStyles` is what lets chunk cache keys be memoized on a styles object.
 * Storing an entry is the expensive half of that memo, so it must only happen
 * where the entry will be read back: on the server, which has no equivalent of
 * the factory-level `classNameCache` in tasty.tsx and therefore re-enters
 * `computeStyles()` with the same object on every render.
 *
 * This file runs in the node project, so `document` is undefined — the server
 * shape. The client half lives in `src/tasty-stable-styles.test.tsx`.
 */

import type * as ChunksModule from '../chunks';
import { tasty } from '../tasty';

import { ServerStyleCollector } from './collector';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

const { optIns } = vi.hoisted(() => ({
  optIns: [] as (boolean | undefined)[],
}));

vi.mock('../chunks', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ChunksModule;
  return {
    ...actual,
    generateChunkCacheKey: (
      styles: Parameters<typeof actual.generateChunkCacheKey>[0],
      chunkName: string,
      styleKeys: string[],
      reusable?: boolean,
    ) => {
      optIns.push(reusable);
      return actual.generateChunkCacheKey(
        styles,
        chunkName,
        styleKeys,
        reusable,
      );
    },
  };
});

function render(Component: unknown, props: object = {}) {
  const collector = new ServerStyleCollector();
  registerSSRCollectorGetter(() => collector);
  try {
    (Component as { render: (p: object, r: null) => unknown }).render(
      props,
      null,
    );
  } finally {
    registerSSRCollectorGetter(null as never);
  }
}

beforeEach(() => {
  optIns.length = 0;
});

describe('stableStyles opt-in on the server', () => {
  it('opts in for a factory rendering its own styles', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex' } });

    render(Card);

    expect(optIns.length).toBeGreaterThan(0);
    expect(optIns.every((reusable) => reusable === true)).toBe(true);
  });

  it('does not opt in when instance styles produce a per-render object', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex' } });

    render(Card, { styles: { color: '#text' } });

    expect(optIns.length).toBeGreaterThan(0);
    expect(optIns.some((reusable) => reusable === true)).toBe(false);
  });
});
