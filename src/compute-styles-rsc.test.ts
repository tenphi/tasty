import { resetConfig } from './config';
import type * as RSCModule from './rsc-cache';
import type { RSCStyleCache } from './rsc-cache';
import type { Styles } from './styles/types';

const { rscCache } = vi.hoisted(() => ({
  rscCache: {
    cacheKeyToClassName: new Map(),
    emittedKeys: new Set(),
    internalsEmitted: false,
    pendingCSS: [],
    keyToIndex: new Map(),
    generatedNames: new Map(),
  } as RSCStyleCache,
}));

vi.mock('./rsc-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof RSCModule>();
  return { ...actual, getRSCCache: () => rscCache };
});

import { computeStyles } from './compute-styles';

const styles: Styles = {
  '@property': {
    '$rsc-progress': {
      syntax: '<number>',
      inherits: false,
      initialValue: '0',
    },
  },
  '@font-face': {
    'RSC Test': [
      { src: 'url("/rsc-regular.woff2")', fontWeight: 400 },
      { src: 'url("/rsc-bold.woff2")', fontWeight: 700 },
    ],
  },
  '@counter-style': {
    'rsc-dashes': { system: 'cyclic', symbols: '"\u2014"', suffix: '" "' },
  },
  '@function': {
    '$$rsc-double': { args: ['$value'], result: '(2 * $value)' },
  },
  '@keyframes': {
    'rsc-fade': { from: { opacity: 0 }, to: { opacity: 1 } },
  },
  animation: 'rsc-fade 1s',
  opacity: '$rsc-progress',
  marginTop: '$$rsc-double(1px)',
};

describe('computeStyles RSC ancillary resources', () => {
  beforeEach(() => {
    rscCache.cacheKeyToClassName.clear();
    rscCache.emittedKeys.clear();
    rscCache.internalsEmitted = false;
    rscCache.pendingCSS.length = 0;
    rscCache.keyToIndex.clear();
    rscCache.generatedNames.clear();
    resetConfig();
  });

  afterEach(() => resetConfig());

  it('emits local resources once per request cache', () => {
    const first = computeStyles(styles, { ssrCollector: null });
    const second = computeStyles(styles, { ssrCollector: null });

    expect(first.className).toMatch(/^t[a-z0-9]+/);
    expect(first.css?.match(/@property --rsc-progress/g)).toHaveLength(1);
    expect(first.css?.match(/@font-face/g)).toHaveLength(2);
    expect(first.css).toContain('/rsc-regular.woff2');
    expect(first.css).toContain('/rsc-bold.woff2');
    expect(first.css?.match(/@counter-style rsc-dashes/g)).toHaveLength(1);
    expect(first.css?.match(/@function --rsc-double/g)).toHaveLength(1);
    expect(first.css?.match(/@keyframes rsc-fade-[a-z0-9]+/g)).toHaveLength(1);
    expect(rscCache.internalsEmitted).toBe(true);

    expect(second.className).toBe(first.className);
    expect(second.css).toBeUndefined();
  });
});
