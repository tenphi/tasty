import { useContext, useInsertionEffect } from 'react';

import { computeStyles } from '../compute-styles';
import { getConfig, getStyleEpoch } from '../config';
import { acquireStyles, releaseStyles } from '../injector';
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
  const root = options?.root;
  const managed = commitManaged();
  const result = computeStyles(styles, {
    ssrCollector: useContext(getTastySSRContext()),
    root,
    managed,
  });

  if (managed) {
    useStyleCommit(result.className, root);
  }

  return result;
}

const CAN_COMMIT = typeof document !== 'undefined';

let commitManagedMemo = false;
let commitManagedEpoch = -1;

/**
 * Whether styles should be held through the commit rather than written during
 * render — see the same gate in `tasty()`. Only applications that configured
 * `gc` take the insertion effect; everything else keeps the synchronous path.
 */
function commitManaged(): boolean {
  const epoch = getStyleEpoch();

  if (commitManagedEpoch !== epoch) {
    commitManagedEpoch = epoch;
    commitManagedMemo = CAN_COMMIT && getConfig().gc != null;
  }

  return commitManagedMemo;
}

/**
 * Hold the styles this render resolved for as long as the component is mounted.
 *
 * Rendering only names the classes and records what they stand for; this is
 * where they reach the sheet. `useInsertionEffect` is React's insertion phase —
 * it runs after every render in the commit and before any layout effect, so the
 * rules are in place before anything can measure them.
 *
 * The dependency is the class-name string itself, so an unchanged rerender —
 * the overwhelmingly common case — costs one string comparison and nothing
 * else. Because setup re-inserts whatever is missing, a class collected while
 * this render was still pending simply comes back here.
 */
export function useStyleCommit(
  className: string,
  root?: Document | ShadowRoot,
): void {
  useInsertionEffect(() => {
    if (!className) return;

    acquireStyles(className, { root });

    return () => releaseStyles(className, { root });
  }, [className, root]);
}
