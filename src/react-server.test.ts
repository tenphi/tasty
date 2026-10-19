import type { RSCStyleCache } from './rsc-cache';

/**
 * React's `react-server` build — what a Server Component imports — has no
 * `createContext`, `useContext`, `useInsertionEffect` or `useState`. Its
 * `cache` only caches inside a request, so the mock below stands in for one.
 */
const { request } = vi.hoisted(() => ({
  request: { current: new Map<() => RSCStyleCache, RSCStyleCache>() },
}));

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const server = require(
    require.resolve('react').replace(/index\.js$/, 'react.react-server.js'),
  ) as Record<string, unknown>;
  const cache = (create: () => RSCStyleCache) => (): RSCStyleCache => {
    if (!request.current.has(create)) request.current.set(create, create());
    return request.current.get(create)!;
  };
  const react = { ...server, cache };

  return { ...react, default: react };
});

// Each test imports the engine from scratch; under a full parallel run that
// transform alone can take most of the default 5s timeout.
describe('React Server Components', { timeout: 30_000 }, () => {
  beforeEach(() => {
    request.current = new Map();
  });

  it("loads against React's react-server build", async () => {
    const React = (await import('react')).default as Record<string, unknown>;
    expect(React.useContext).toBeUndefined();
    expect(React.createContext).toBeUndefined();

    await expect(import('./index')).resolves.toHaveProperty('useStyles');
  });

  it('useStyles() returns a class whose CSS the next tasty() element emits', async () => {
    const { useStyles, computeStyles } = await import('./index');

    const { className } = useStyles({ color: '#purple' });
    expect(className).toMatch(/^t[a-z0-9]+$/);

    // What the next tasty() element renders into its inline <style>.
    const next = computeStyles({ fill: '#white' });
    expect(next.css).toContain(`.${className}.${className}`);
    expect(next.css).toContain('color: var(--purple-color)');
  });
});
