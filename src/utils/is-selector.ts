/** Check whether a style-object key identifies a nested CSS selector. */
export function isSelector(key: string): boolean {
  return key.startsWith('&') || key.startsWith('.') || /^[A-Z]/.test(key);
}
