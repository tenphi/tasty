/**
 * Create a function that caches the result up to the limit.
 */
export function cacheWrapper<A, B, R>(
  handler: (firstArg: A, secondArg?: B) => R,
  limit = 1000,
): (firstArg: A, secondArg?: B) => R {
  const cache = new Map<string, R>();
  let count = 0;

  return (firstArg: A, secondArg?: B) => {
    const key =
      typeof firstArg === 'string' && secondArg == null
        ? firstArg
        : JSON.stringify([firstArg, secondArg]);

    let result = cache.get(key);
    if (result === undefined) {
      if (count > limit) {
        cache.clear();
        count = 0;
      }
      count++;
      result =
        secondArg == null ? handler(firstArg) : handler(firstArg, secondArg);
      cache.set(key, result);
    }
    return result;
  };
}
