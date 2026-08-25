interface LruNode<K, V> {
  key: K;
  prev: LruNode<K, V> | null;
  next: LruNode<K, V> | null;
  value: V;
}

/**
 * Doubly-linked-list LRU.
 *
 * The list holds direct node references rather than keys, so rewiring on a
 * `get()` of a non-MRU entry is pure pointer work. Storing keys instead cost
 * three extra `Map.get()` lookups per read (prev, next and the current head),
 * which is measurable on these read-mostly caches: they are hit on every
 * render once the style pipeline is warm.
 */
export class Lru<K, V> {
  private map = new Map<K, LruNode<K, V>>();
  private head: LruNode<K, V> | null = null;
  private tail: LruNode<K, V> | null = null;
  private onEvict?: (key: K, value: V) => void;

  constructor(
    private limit = 1000,
    onEvict?: (key: K, value: V) => void,
  ) {
    // Normalize limit; fall back to sensible default (1000) to keep caching enabled
    let normalized = Number.isFinite(this.limit)
      ? Math.floor(this.limit)
      : 1000;
    if (normalized <= 0) normalized = 1000;
    this.limit = normalized;
    this.onEvict = onEvict;
  }

  setOnEvict(fn?: (key: K, value: V) => void) {
    this.onEvict = fn;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    // Fast path: already MRU, nothing to rewire.
    if (this.head !== node) this.moveToHead(node);
    return node.value;
  }

  set(key: K, value: V) {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = value;
      if (this.head !== existing) this.moveToHead(existing);
      return;
    }

    const node: LruNode<K, V> = { key, prev: null, next: this.head, value };
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.map.set(key, node);
    if (this.map.size > this.limit) this.evict();
  }

  delete(key: K) {
    const node = this.map.get(key);
    if (node === undefined) return;
    this.detach(node);
    this.map.delete(key);
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  private detach(node: LruNode<K, V>) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (this.head === node) this.head = node.next;
    if (this.tail === node) this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: LruNode<K, V>) {
    this.detach(node);
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private evict() {
    const node = this.tail;
    if (!node) return;
    this.detach(node);
    this.map.delete(node.key);

    if (this.onEvict) {
      try {
        this.onEvict(node.key, node.value);
      } catch {
        // ignore user callback errors
      }
    }
  }

  clear() {
    this.map.clear();
    this.head = this.tail = null;
  }
}
