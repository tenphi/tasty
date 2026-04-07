/**
 * Shallow comparison of two dependency arrays using Object.is semantics.
 * Returns true when both arrays have the same length and every element
 * at the same index is identical.
 */
export function depsEqual(
  a: readonly unknown[],
  b: readonly unknown[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
