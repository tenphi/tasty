/**
 * Lightweight replacement for `react-is`'s isValidElementType.
 * Detects string tags, function/class components, and React exotic types
 * (forwardRef, memo, lazy, etc.) via their internal $$typeof symbol.
 */
export function isValidElementType(value: unknown): boolean {
  if (typeof value === 'string' || typeof value === 'function') {
    return true;
  }

  if (typeof value === 'object' && value !== null) {
    return typeof (value as { $$typeof?: unknown }).$$typeof === 'symbol';
  }

  return false;
}
