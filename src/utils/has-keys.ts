/**
 * Check if an object has any own enumerable keys.
 * Avoids the array allocation of Object.keys(obj).length > 0.
 */
export function hasKeys(obj: object): boolean {
  for (const _ in obj) return true;
  return false;
}
