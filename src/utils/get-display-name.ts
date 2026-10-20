import type { ElementType } from 'react';

const DEFAULT_NAME = 'Anonymous';

interface NamedType {
  displayName?: string;
  name?: string;
  /** The component inside `forwardRef()`. */
  render?: unknown;
  /** The component inside `memo()`. */
  type?: unknown;
}

function nameOf(type: unknown): string | undefined {
  if (typeof type === 'string') return type;
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) {
    return undefined;
  }

  const { displayName, name, render, type: inner } = type as NamedType;
  if (displayName) return displayName;
  if (typeof type === 'function') return name || undefined;

  // `forwardRef()` and `memo()` return objects; name them after what they wrap.
  return nameOf(render) ?? nameOf(inner);
}

/**
 * A readable name for a component: its `displayName`, else its function name,
 * looking through `forwardRef()` and `memo()` to the component they wrap. A
 * tag name names itself. Falls back to `fallbackName` when there is none.
 */
export function getDisplayName<T>(
  Component: ElementType<T>,
  fallbackName = DEFAULT_NAME,
): string {
  return nameOf(Component) ?? fallbackName;
}
