import { useContext } from 'react';

import { computeStyles } from '../compute-styles';
import type { ServerStyleCollector } from '../ssr/collector';
import { TastySSRContext } from '../ssr/context';
import type { Styles } from '../styles/types';

/**
 * Tasty styles object to generate CSS classes for.
 * Can be undefined or empty object for no styles.
 */
export type UseStylesOptions = Styles | undefined;

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
export function useStyles(styles: UseStylesOptions): UseStylesResult {
  const ssrContextValue: ServerStyleCollector | null =
    useContext(TastySSRContext);

  return computeStyles(styles, {
    ssrCollector: ssrContextValue,
  });
}
