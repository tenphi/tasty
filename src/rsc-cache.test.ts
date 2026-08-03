/**
 * @vitest-environment happy-dom
 */
import { flushPendingCSS, pushRSCCSS } from './rsc-cache';
import type { RSCStyleCache } from './rsc-cache';

function createCache(): RSCStyleCache {
  return {
    cacheKeyToClassName: new Map(),
    emittedKeys: new Set(),
    internalsEmitted: false,
    pendingCSS: [],
    keyToIndex: new Map(),
    generatedNames: new Map(),
  };
}

describe('pushRSCCSS', () => {
  it('dedupes by key', () => {
    const cache = createCache();

    expect(pushRSCCSS(cache, 'k', '.a { color: red; }')).toBe(true);
    expect(pushRSCCSS(cache, 'k', '.a { color: blue; }')).toBe(false);

    expect(cache.pendingCSS).toEqual(['.a { color: red; }']);
  });

  it('replaces a slot-keyed entry in place, keeping its position', () => {
    const cache = createCache();

    pushRSCCSS(cache, 'first', '.first {}');
    pushRSCCSS(cache, 'slot', '.slot { color: red; }', true);
    pushRSCCSS(cache, 'last', '.last {}');

    expect(pushRSCCSS(cache, 'slot', '.slot { color: blue; }', true)).toBe(
      true,
    );

    expect(cache.pendingCSS).toEqual([
      '.first {}',
      '.slot { color: blue; }',
      '.last {}',
    ]);
  });

  it('appends a slot-keyed entry after its buffer was flushed', () => {
    const cache = createCache();

    pushRSCCSS(cache, 'slot', '.slot { color: red; }', true);
    expect(flushPendingCSS(cache)).toBe('.slot { color: red; }');

    // The slot is gone with the buffer, so the update appends instead — it
    // still wins by cascade order in the emitted <style> tags.
    pushRSCCSS(cache, 'slot', '.slot { color: blue; }', true);

    expect(cache.pendingCSS).toEqual(['.slot { color: blue; }']);
  });
});
