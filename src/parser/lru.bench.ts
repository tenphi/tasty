import { bench, describe } from 'vitest';

import { Lru } from './lru';

const SIZE = 2000;

const keys = Array.from({ length: SIZE }, (_, i) => `key-${i}`);

function makeFilled(): Lru<string, number> {
  const lru = new Lru<string, number>(SIZE);
  for (let i = 0; i < SIZE; i++) lru.set(keys[i], i);
  return lru;
}

const readCache = makeFilled();
const mruCache = makeFilled();
// Make the last key the MRU entry so the "already MRU" fast path is measured.
mruCache.get(keys[SIZE - 1]);

let writeCache = new Lru<string, number>(512);
let idx = 0;

describe('Lru read path', () => {
  // The steady-state shape: reads land on non-MRU entries and have to rewire
  // the list. This is what tasty's caches do on every render.
  bench('get (scattered hits, rewires the list)', () => {
    readCache.get(keys[idx++ % SIZE]);
  });

  bench('get (repeat hit on MRU entry)', () => {
    mruCache.get(keys[SIZE - 1]);
  });

  bench('get (miss)', () => {
    readCache.get('absent');
  });

  bench(
    'set (fresh keys, with eviction)',
    () => {
      writeCache.set(`w-${idx++}`, idx);
    },
    {
      setup() {
        writeCache = new Lru<string, number>(512);
        idx = 0;
      },
    },
  );
});
