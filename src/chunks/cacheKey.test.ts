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
});
