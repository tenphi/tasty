import type { RSCStyleCache } from './rsc-cache';

const { react } = vi.hoisted(() => ({
  react: {
    cache: undefined as
      undefined | ((fn: () => RSCStyleCache) => () => RSCStyleCache),
  },
}));

vi.mock('react', () => ({ default: react }));

afterEach(() => {
  react.cache = undefined;
  vi.resetModules();
});

describe('RSC cache React compatibility', () => {
  it('loads without the React 19 cache export and keeps fallback state isolated', async () => {
    const { getRSCCache, pushRSCCSS, rscAllocateClassName } =
      await import('./rsc-cache');
    const first = getRSCCache();
    rscAllocateClassName(first, 'component');
    pushRSCCSS(first, 'global', '.private { color: red; }');
    first.internalsEmitted = true;
    first.generatedNames.set('animation', 'private-animation');

    const second = getRSCCache();
    expect(second).not.toBe(first);
    expect(second.cacheKeyToClassName.size).toBe(0);
    expect(second.emittedKeys.size).toBe(0);
    expect(second.internalsEmitted).toBe(false);
    expect(second.pendingCSS).toEqual([]);
    expect(second.keyToIndex.size).toBe(0);
    expect(second.generatedNames.size).toBe(0);

    expect(rscAllocateClassName(second, 'component').isNew).toBe(true);
    expect(pushRSCCSS(second, 'global', '.public {}')).toBe(true);
    expect(first.pendingCSS).toEqual(['.private { color: red; }']);
  });

  it('uses React cache once and preserves its request-scoped lifetime', async () => {
    let request = new Map<() => RSCStyleCache, RSCStyleCache>();
    const cache = vi.fn((create: () => RSCStyleCache) => () => {
      if (!request.has(create)) request.set(create, create());
      return request.get(create)!;
    });
    react.cache = cache;
    const { getRSCCache, pushRSCCSS } = await import('./rsc-cache');

    expect(cache).toHaveBeenCalledTimes(1);
    const first = getRSCCache();
    pushRSCCSS(first, 'global', '.first {}');
    expect(getRSCCache()).toBe(first);
    expect(getRSCCache().pendingCSS).toEqual(['.first {}']);

    request = new Map();
    const second = getRSCCache();
    expect(second).not.toBe(first);
    expect(second.pendingCSS).toEqual([]);
    expect(pushRSCCSS(second, 'global', '.second {}')).toBe(true);
    expect(getRSCCache()).toBe(second);
    expect(cache).toHaveBeenCalledTimes(1);
  });
});
