import type { Styles } from '../styles/types';

import { generateChunkCacheKey } from './cacheKey';
import { categorizeStyleKeys } from './definitions';

function chunksOf(styles: Styles): [string, string[]][] {
  return Array.from(categorizeStyleKeys(styles as Record<string, unknown>)) as [
    string,
    string[],
  ][];
}

describe('generateChunkCacheKey', () => {
  it('preserves the cache-key wire format', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;

    expect(generateChunkCacheKey(styles, 'display', ['display', 'flow'])).toBe(
      'display\0display:"flex"\0flow:"column"',
    );
  });

  it('preserves the local-state prefix format', () => {
    const styles = {
      '@active': ':hover',
      color: { '': '#text', '@active': '#primary' },
    } as unknown as Styles;

    expect(generateChunkCacheKey(styles, 'appearance', ['color'])).toBe(
      '[states:@active=:hover]\0appearance\0color:{"":"#text","@active":"#primary"}',
    );
  });

  it('captures top-level values before serializing nested values', () => {
    const reads: string[] = [];
    const nested = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        reads.push('nested');
        return 'a';
      },
    });
    const styles = Object.defineProperties(
      {},
      {
        first: {
          enumerable: true,
          get() {
            reads.push('first');
            return nested;
          },
        },
        second: {
          enumerable: true,
          get() {
            reads.push('second');
            return 'b';
          },
        },
      },
    ) as Styles;

    generateChunkCacheKey(styles, 'misc', ['first', 'second']);

    expect(reads.slice(0, 2)).toEqual(['first', 'second']);
    expect(reads.indexOf('nested')).toBeGreaterThan(1);
  });

  it('is stable across repeat calls with the same styles object', () => {
    const styles = { display: 'flex', padding: '2x' } as Styles;
    const [[chunkName, styleKeys]] = chunksOf(styles).filter(([, keys]) =>
      keys.includes('display'),
    );

    const first = generateChunkCacheKey(styles, chunkName, styleKeys);
    const second = generateChunkCacheKey(styles, chunkName, styleKeys);

    expect(second).toBe(first);
  });

  it('is stable across equal-but-distinct styles objects', () => {
    const a = { display: 'flex', padding: '2x' } as Styles;
    const b = { padding: '2x', display: 'flex' } as Styles;

    const keysA = chunksOf(a);
    const keysB = chunksOf(b);

    expect(keysA.map(([name]) => name)).toEqual(keysB.map(([name]) => name));

    for (let i = 0; i < keysA.length; i++) {
      expect(generateChunkCacheKey(b, keysB[i][0], keysB[i][1])).toBe(
        generateChunkCacheKey(a, keysA[i][0], keysA[i][1]),
      );
    }
  });

  it('keys each chunk of one styles object separately', () => {
    const styles = { display: 'flex', color: '#text', width: '10x' } as Styles;
    const chunks = chunksOf(styles);

    expect(chunks.length).toBeGreaterThan(1);

    const keys = chunks.map(([name, styleKeys]) =>
      generateChunkCacheKey(styles, name, styleKeys),
    );

    expect(new Set(keys).size).toBe(keys.length);

    // Re-keying the same chunks must not return another chunk's key.
    chunks.forEach(([name, styleKeys], i) => {
      expect(generateChunkCacheKey(styles, name, styleKeys)).toBe(keys[i]);
    });
  });

  it('distinguishes different styleKeys within the same chunk', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;
    const chunk = 'display';

    const both = generateChunkCacheKey(styles, chunk, ['display', 'flow']);
    const one = generateChunkCacheKey(styles, chunk, ['display']);
    const bothAgain = generateChunkCacheKey(styles, chunk, ['display', 'flow']);

    expect(one).not.toBe(both);
    expect(bothAgain).toBe(both);
  });

  it('reflects differing values for the same key set', () => {
    const a = { display: 'flex' } as Styles;
    const b = { display: 'grid' } as Styles;

    expect(generateChunkCacheKey(b, 'display', ['display'])).not.toBe(
      generateChunkCacheKey(a, 'display', ['display']),
    );
  });

  it('folds referenced local predefined states into the key', () => {
    const base = {
      color: { '': '#text', '@active': '#primary' },
    } as unknown as Styles;
    const withState = {
      '@active': ':hover',
      color: { '': '#text', '@active': '#primary' },
    } as unknown as Styles;
    const withOtherState = {
      '@active': ':focus-visible',
      color: { '': '#text', '@active': '#primary' },
    } as unknown as Styles;

    const keyBase = generateChunkCacheKey(base, 'appearance', ['color']);
    const keyState = generateChunkCacheKey(withState, 'appearance', ['color']);
    const keyOther = generateChunkCacheKey(withOtherState, 'appearance', [
      'color',
    ]);

    expect(keyState).not.toBe(keyBase);
    expect(keyOther).not.toBe(keyState);
    expect(generateChunkCacheKey(withState, 'appearance', ['color'])).toBe(
      keyState,
    );
  });

  it('ignores local predefined states the chunk does not reference', () => {
    const withUnusedState = {
      '@unused': ':hover',
      display: 'flex',
    } as unknown as Styles;
    const plain = { display: 'flex' } as Styles;

    expect(generateChunkCacheKey(withUnusedState, 'display', ['display'])).toBe(
      generateChunkCacheKey(plain, 'display', ['display']),
    );
  });

  // `Styles` is a plain mutable object and nothing in the public
  // `computeStyles` / `useStyles` contract asks callers to freeze it, so a
  // top-level change must always be reflected in the key. These pin that
  // contract down: an earlier attempt to memoize the key on the styles
  // object's identity broke every one of them.
  it('invalidates when a top-level primitive value is mutated in place', () => {
    const styles = { display: 'flex' } as Styles;

    const first = generateChunkCacheKey(styles, 'display', ['display']);
    (styles as Record<string, unknown>).display = 'grid';

    expect(generateChunkCacheKey(styles, 'display', ['display'])).not.toBe(
      first,
    );
  });

  it('invalidates when a top-level object value is replaced', () => {
    const styles = {
      color: { '': '#text', ':hover': '#primary' },
    } as unknown as Styles;

    const first = generateChunkCacheKey(styles, 'appearance', ['color']);
    (styles as Record<string, unknown>).color = {
      '': '#text',
      ':hover': '#danger',
    };

    expect(generateChunkCacheKey(styles, 'appearance', ['color'])).not.toBe(
      first,
    );
  });

  it('invalidates when a top-level value is deleted', () => {
    const styles = { display: 'flex' } as Styles;

    const first = generateChunkCacheKey(styles, 'display', ['display']);
    delete (styles as Record<string, unknown>).display;

    expect(generateChunkCacheKey(styles, 'display', ['display'])).not.toBe(
      first,
    );
  });

  // `styleKeys` belongs to the caller and `generateChunkCacheKey` is a public
  // export, so any future cache must not hold on to the array it was handed.
  it('invalidates when the caller mutates the styleKeys array it passed', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;
    const styleKeys = ['display'];

    const first = generateChunkCacheKey(styles, 'display', styleKeys);
    styleKeys.push('flow');

    expect(generateChunkCacheKey(styles, 'display', styleKeys)).not.toBe(first);
  });

  it('does not let a mutated styleKeys array corrupt an unrelated lookup', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;
    const styleKeys = ['display', 'flow'];

    const both = generateChunkCacheKey(styles, 'display', styleKeys);
    styleKeys.pop();
    const one = generateChunkCacheKey(styles, 'display', styleKeys);

    expect(one).not.toBe(both);
    // The original key must still be reproducible from an equivalent array.
    expect(generateChunkCacheKey(styles, 'display', ['display', 'flow'])).toBe(
      both,
    );
  });

  it('returns the same key again once a changed value is restored', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;

    const first = generateChunkCacheKey(styles, 'display', ['display', 'flow']);
    (styles as Record<string, unknown>).flow = 'row';
    const changed = generateChunkCacheKey(styles, 'display', [
      'display',
      'flow',
    ]);
    (styles as Record<string, unknown>).flow = 'column';
    const restored = generateChunkCacheKey(styles, 'display', [
      'display',
      'flow',
    ]);

    expect(changed).not.toBe(first);
    expect(restored).toBe(first);
  });
});

// The `reusable` opt-in stores the generated key on the styles object. Every
// invalidation rule above has to survive that, because a stored key is the one
// thing that can outlive the values it was built from.
describe('generateChunkCacheKey (reusable: true)', () => {
  const memo = (styles: Styles, chunk: string, keys: string[]) =>
    generateChunkCacheKey(styles, chunk, keys, true);

  it('returns a stable key across repeat calls', () => {
    const styles = { display: 'flex', padding: '2x' } as Styles;

    const first = memo(styles, 'display', ['display']);

    expect(memo(styles, 'display', ['display'])).toBe(first);
    expect(first).toContain('flex');
  });

  it('invalidates when a top-level primitive value is mutated in place', () => {
    const styles = { display: 'flex' } as Styles;

    const first = memo(styles, 'display', ['display']);
    (styles as Record<string, unknown>).display = 'grid';

    expect(memo(styles, 'display', ['display'])).not.toBe(first);
  });

  it('invalidates when a top-level object value is replaced', () => {
    const styles = {
      color: { '': '#text', ':hover': '#primary' },
    } as unknown as Styles;

    const first = memo(styles, 'appearance', ['color']);
    (styles as Record<string, unknown>).color = {
      '': '#text',
      ':hover': '#danger',
    };

    expect(memo(styles, 'appearance', ['color'])).not.toBe(first);
  });

  it('invalidates when a top-level value is deleted', () => {
    const styles = { display: 'flex' } as Styles;

    const first = memo(styles, 'display', ['display']);
    delete (styles as Record<string, unknown>).display;

    expect(memo(styles, 'display', ['display'])).not.toBe(first);
  });

  it("does not hold on to the caller's styleKeys array", () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;
    const styleKeys = ['display'];

    const first = memo(styles, 'display', styleKeys);
    styleKeys.push('flow');

    expect(memo(styles, 'display', styleKeys)).not.toBe(first);
  });

  it('keeps chunks of one styles object independent', () => {
    const styles = { display: 'flex', color: '#text', width: '10x' } as Styles;
    const chunks = chunksOf(styles);

    const keys = chunks.map(([name, styleKeys]) =>
      memo(styles, name, styleKeys),
    );

    expect(new Set(keys).size).toBe(keys.length);
    chunks.forEach(([name, styleKeys], i) => {
      expect(memo(styles, name, styleKeys)).toBe(keys[i]);
    });
  });

  it('agrees with a non-reusable call on the same input', () => {
    const styles = { display: 'flex', flow: 'column' } as Styles;

    const stored = memo(styles, 'display', ['display', 'flow']);

    // A stored entry is readable without opting in again, and both paths must
    // produce the same key for the same input either way.
    expect(generateChunkCacheKey(styles, 'display', ['display', 'flow'])).toBe(
      stored,
    );

    const twin = { display: 'flex', flow: 'column' } as Styles;
    expect(generateChunkCacheKey(twin, 'display', ['display', 'flow'])).toBe(
      stored,
    );
  });
});
