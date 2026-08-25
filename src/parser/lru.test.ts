import { Lru } from './lru';

describe('Lru', () => {
  it('should call onEvict callback when items are evicted', () => {
    const evictedItems: { key: string; value: string }[] = [];
    const onEvict = (key: string, value: string) => {
      evictedItems.push({ key, value });
    };

    const lru = new Lru<string, string>(2, onEvict);

    // Fill cache
    lru.set('a', 'value-a');
    lru.set('b', 'value-b');

    // No evictions yet
    expect(evictedItems).toHaveLength(0);

    // This should evict 'a'
    lru.set('c', 'value-c');

    expect(evictedItems).toHaveLength(1);
    expect(evictedItems[0]).toEqual({ key: 'a', value: 'value-a' });

    // This should evict 'b'
    lru.set('d', 'value-d');

    expect(evictedItems).toHaveLength(2);
    expect(evictedItems[1]).toEqual({ key: 'b', value: 'value-b' });
  });

  it('should allow setting onEvict callback after construction', () => {
    const evictedItems: { key: string; value: string }[] = [];
    const lru = new Lru<string, string>(2);

    // Set callback later
    lru.setOnEvict((key, value) => {
      evictedItems.push({ key, value });
    });

    lru.set('a', 'value-a');
    lru.set('b', 'value-b');
    lru.set('c', 'value-c'); // Should evict 'a'

    expect(evictedItems).toHaveLength(1);
    expect(evictedItems[0]).toEqual({ key: 'a', value: 'value-a' });
  });

  it('should return all keys via keys() method', () => {
    const lru = new Lru<string, string>(3);

    lru.set('first', 'value1');
    lru.set('second', 'value2');
    lru.set('third', 'value3');

    const keys = Array.from(lru.keys());
    expect(keys).toHaveLength(3);
    expect(keys).toContain('first');
    expect(keys).toContain('second');
    expect(keys).toContain('third');
  });

  it('should handle eviction callback errors gracefully', () => {
    const errorCallback = () => {
      throw new Error('Eviction error');
    };

    const lru = new Lru<string, string>(1, errorCallback);

    // This should not throw despite the callback error
    expect(() => {
      lru.set('a', 'value-a');
      lru.set('b', 'value-b'); // Should evict 'a' and call errorCallback
    }).not.toThrow();
  });

  it('should work without onEvict callback', () => {
    const lru = new Lru<string, string>(2);

    expect(() => {
      lru.set('a', 'value-a');
      lru.set('b', 'value-b');
      lru.set('c', 'value-c'); // Should evict 'a' without error
    }).not.toThrow();

    expect(lru.get('a')).toBeUndefined();
    expect(lru.get('b')).toBe('value-b');
    expect(lru.get('c')).toBe('value-c');
  });

  it('evicts the least-recently-used entry, not the oldest insert', () => {
    const evicted: string[] = [];
    const lru = new Lru<string, string>(2, (key) => {
      evicted.push(key);
    });

    lru.set('a', 'value-a');
    lru.set('b', 'value-b');

    // Reading 'a' makes it the MRU entry, so 'b' becomes the eviction target.
    expect(lru.get('a')).toBe('value-a');

    lru.set('c', 'value-c');

    expect(evicted).toEqual(['b']);
    expect(lru.get('a')).toBe('value-a');
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('c')).toBe('value-c');
  });

  it('keeps eviction order correct when the middle entry is read', () => {
    const evicted: string[] = [];
    const lru = new Lru<string, string>(3, (key) => {
      evicted.push(key);
    });

    lru.set('a', '1');
    lru.set('b', '2');
    lru.set('c', '3');

    // 'b' is in the middle of the list; touching it must rewire both neighbours.
    expect(lru.get('b')).toBe('2');

    lru.set('d', '4'); // evicts 'a' (LRU)
    lru.set('e', '5'); // evicts 'c' (next LRU)

    expect(evicted).toEqual(['a', 'c']);
    expect(Array.from(lru.keys()).sort()).toEqual(['b', 'd', 'e']);
  });

  it('re-setting an existing key refreshes recency without growing the cache', () => {
    const evicted: string[] = [];
    const lru = new Lru<string, string>(2, (key) => {
      evicted.push(key);
    });

    lru.set('a', '1');
    lru.set('b', '2');
    lru.set('a', '1-updated');

    expect(evicted).toEqual([]);
    expect(Array.from(lru.keys())).toHaveLength(2);

    lru.set('c', '3');

    expect(evicted).toEqual(['b']);
    expect(lru.get('a')).toBe('1-updated');
  });

  it('deleting the head, tail and a middle entry keeps the list traversable', () => {
    const lru = new Lru<string, string>(4);

    lru.set('a', '1');
    lru.set('b', '2');
    lru.set('c', '3');
    lru.set('d', '4'); // head is 'd', tail is 'a'

    lru.delete('d'); // head
    lru.delete('a'); // tail
    lru.delete('b'); // middle of what remains

    expect(Array.from(lru.keys())).toEqual(['c']);
    expect(lru.get('c')).toBe('3');

    // The cache must still evict correctly after the surgery.
    lru.set('e', '5');
    lru.set('f', '6');
    lru.set('g', '7');
    lru.set('h', '8'); // limit is 4, so 'c' (LRU) goes

    expect(lru.get('c')).toBeUndefined();
    expect(Array.from(lru.keys()).sort()).toEqual(['e', 'f', 'g', 'h']);
  });

  it('survives clear() followed by reuse', () => {
    const lru = new Lru<string, string>(2);

    lru.set('a', '1');
    lru.set('b', '2');
    lru.clear();

    expect(lru.get('a')).toBeUndefined();
    expect(Array.from(lru.keys())).toEqual([]);

    lru.set('c', '3');
    lru.set('d', '4');
    lru.set('e', '5');

    expect(lru.get('c')).toBeUndefined();
    expect(lru.get('d')).toBe('4');
    expect(lru.get('e')).toBe('5');
  });
});
