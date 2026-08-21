import { useInsertionEffect } from 'react';
import type { ReactNode } from 'react';

import { closeBatchWindow, openBatchWindow } from './injector/batch';

export interface TastyBatchProviderProps {
  children?: ReactNode;
}

/**
 * Opens a *batch window* for the commit it renders in, so `batchInjection`
 * can defer stylesheet writes without ever letting a layout effect measure an
 * unstyled element.
 *
 * Every `insertRule()` on a live sheet invalidates style for that sheet's
 * scope. When components inject during React's render phase while others read
 * layout in the same pass, the two interleave and the browser recalculates
 * style between every injection. Batching collapses that into one invalidation
 * per flush — but only if the flush happens before anything can measure.
 *
 * ```
 * provider renders          -> window OPEN
 *   children render         -> injections queued
 * provider insertionEffect  -> FLUSH, window CLOSED
 * layout effects run        -> rules are in the sheet
 * ```
 *
 * `useInsertionEffect` runs in React's mutation phase, after every render in
 * the commit and before any `useLayoutEffect` — which is exactly why React
 * added it for CSS-in-JS libraries. Effects fire child-first, so this
 * provider's runs after every descendant's and still before all layout
 * effects.
 *
 * A commit that does not re-render this provider gets no window, and those
 * injections are written synchronously instead. That is the point: turning
 * `batchInjection: true` on can only ever make injection cheaper, never make a
 * measurement wrong. It also means batching applies to commits this provider
 * takes part in, so mount it as high in the tree as you can.
 *
 * Requires `configure({ batchInjection: true })`; without it this component
 * only renders its children. `batchInjection: 'always'` does not need the
 * provider at all — see that option's docs for the trade-off it accepts.
 *
 * @example
 * ```tsx
 * configure({ batchInjection: true });
 *
 * createRoot(el).render(
 *   <TastyBatchProvider>
 *     <App />
 *   </TastyBatchProvider>,
 * );
 * ```
 */
export function TastyBatchProvider({ children }: TastyBatchProviderProps) {
  // Opened during render on purpose: the window has to be open before children
  // render, and this is the only phase that precedes them. It is idempotent and
  // has no other side effect. A render that is thrown away (aborted or
  // suspended) leaves the counter raised, which the microtask backstop resets —
  // and such a render mounts nothing, so nothing can measure what it queued.
  openBatchWindow();

  // Fires in the mutation phase, before any layout effect. No dependency array:
  // it must run on every commit this provider is part of.
  useInsertionEffect(() => {
    closeBatchWindow();
  });

  return children;
}
