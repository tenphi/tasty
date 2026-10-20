import React from 'react';

import { computeStyles } from '../compute-styles';
import { checkRequestScope, getRSCCache, queueRSCCSS } from '../rsc-cache';
import type { ServerStyleCollector } from '../ssr/collector';
import { getTastySSRContext } from '../ssr/context';
import type { Styles } from '../styles/types';

/**
 * The collector `TastyRegistry` provides through context. React's
 * `react-server` build has no `useContext` (nor any context to read), so a
 * Server Component skips the lookup. Chosen once per module, so the hook
 * order of a component never changes.
 */
const useContextCollector: () => ServerStyleCollector | null =
  typeof React.useContext === 'function'
    ? () => React.useContext(getTastySSRContext())
    : () => null;

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
 * Works in Server Components too. There, like the other style functions, it
 * cannot emit CSS itself: the next `tasty()` element in the tree emits it, so
 * render one after it.
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
  const result = computeStyles(styles, {
    ssrCollector: useContextCollector(),
    root: options?.root,
  });

  // RSC: the CSS comes back for an inline <style>, which only a tasty()
  // element renders. Queue it for the next one, as the other style functions
  // do, rather than drop it with the result.
  if (result.css) {
    checkRequestScope();
    queueRSCCSS(getRSCCache(), result.css);
    return { className: result.className };
  }

  return result;
}
