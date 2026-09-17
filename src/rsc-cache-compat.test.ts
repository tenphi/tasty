const { react } = vi.hoisted(() => ({
  react: {
    cache: undefined as undefined | ((fn: () => unknown) => () => unknown),
  },
}));

vi.mock('react', () => ({ default: react }));

afterEach(() => {
  react.cache = undefined;
  vi.resetModules();
});

describe('RSC cache React compatibility', () => {
  it('loads without the React 19 cache export and keeps fallback state isolated', async () => {
    const { getRSCCache } = await import('./rsc-cache');
    const first = getRSCCache();
    const second = getRSCCache();
    first.pendingCSS.push('.first {}');
    first.emittedKeys.add('first');
    expect(second).not.toBe(first);
    expect(second.pendingCSS).toEqual([]);
    expect(second.emittedKeys.size).toBe(0);
  });

  it('uses React cache when available', async () => {
    const cache = vi.fn((fn: () => unknown) => {
      const value = fn();
      return () => value;
    });
    react.cache = cache;
    const { getRSCCache } = await import('./rsc-cache');
    expect(cache).toHaveBeenCalledTimes(1);
    expect(getRSCCache()).toBe(getRSCCache());
  });
});
