import { useContext } from 'react';

import { computeStyles } from '../compute-styles';
import { getTastySSRContext } from '../ssr/context';
import type { Styles } from '../styles/types';

export interface UseStylesResult {
  /**
   * Generated className(s) to apply to the element.
   * Can be empty string if no styles are provided.
   * With chunking enabled, may contain multiple space-separated class names.
   */
  className: string;
}

/**
 * Hook to generate CSS classes from Tasty styles.
 * Thin wrapper around `computeStyles()` that adds React context-based
 * SSR collector discovery for backward compatibility with TastyRegistry.
 *
 * For hook-free usage (e.g. in server components), use `computeStyles()` directly.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { className } = useStyles({
 *     padding: '2x',
 *     fill: '#purple',
 *     radius: '1r',
 *   });
 *
 *   return <div className={className}>Styled content</div>;
 * }
 * ```
 */
export function useStyles(
  styles: Styles | undefined,
  options?: { root?: Document | ShadowRoot },
): UseStylesResult {
  return computeStyles(styles, {
    ssrCollector: useContext(getTastySSRContext()),
    root: options?.root,
  });
}
