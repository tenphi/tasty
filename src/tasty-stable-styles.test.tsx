/**
 * The client counterpart to `src/ssr/stable-styles-optin.test.ts`.
 *
 * In the browser the factory-level `classNameCache` answers every render after
 * the first, so `computeStyles()` never sees a given factory styles object
 * twice. Opting into the chunk-key memo there would write entries nothing ever
 * reads back — the store being the expensive half of that memo. This file runs
 * in the browser project, so `document` is defined.
 */

import { render } from '@testing-library/react';

import type * as ChunksModule from './chunks';
import { tasty } from './tasty';

const { optIns } = vi.hoisted(() => ({
  optIns: [] as (boolean | undefined)[],
}));

vi.mock('./chunks', async (importOriginal) => {
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

beforeEach(() => {
  optIns.length = 0;
});

describe('stableStyles opt-in in the browser', () => {
  it('never opts in, including on the first render of a factory', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex', gap: '1x' } });

    render(<Card />);

    // The first render is the only one that reaches computeStyles; after it
    // classNameCache takes over, so any entry stored here is write-only.
    expect(optIns.length).toBeGreaterThan(0);
    expect(optIns.some((reusable) => reusable === true)).toBe(false);
  });

  it('does not opt in on re-renders or with instance styles', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex' } });

    const view = render(<Card />);
    view.rerender(<Card />);
    view.rerender(<Card styles={{ color: '#text' }} />);

    expect(optIns.some((reusable) => reusable === true)).toBe(false);
  });
});
