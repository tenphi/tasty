import { Lru } from '../parser/lru';

/**
 * Create a function that caches the result with LRU eviction.
 */
export function cacheWrapper<A, B, R>(
  handler: (firstArg: A, secondArg?: B) => R,
  limit = 1000,
): (firstArg: A, secondArg?: B) => R {
  const cache = new Lru<string, R>(limit);

  return (firstArg: A, secondArg?: B) => {
    const key =
      typeof firstArg === 'string' && secondArg == null
        ? firstArg
        : JSON.stringify([firstArg, secondArg]);

    let result = cache.get(key);
    if (result === undefined) {
      result =
        secondArg == null ? handler(firstArg) : handler(firstArg, secondArg);
      cache.set(key, result);
    }
    return result;
  };
}
