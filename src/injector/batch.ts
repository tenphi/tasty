/**
 * Deferred CSSOM writes ("batched injection").
 *
 * Every `insertRule()` on a live stylesheet invalidates style for the sheet's
 * scope, so Blink recalculates style the next time anything reads layout or
 * computed style. When components inject during React's render phase and other
 * components read layout in the same pass, the two interleave:
 *
 *   inject -> read (forced recalc) -> inject -> read (forced recalc) -> ...
 *
 * Batching moves every sheet write out from between those reads. Writes are
 * queued in FIFO order and drained in one go, so the tree is invalidated once
 * per flush instead of once per component.
 *
 * ## Ordering
 *
 * A single queue holds *all* writes — component rules, global rules, keyframes,
 * `@property`, `@font-face`, `@counter-style`, `@function` and raw CSS. Draining
 * it in insertion order keeps the sheet byte-identical to unbatched output,
 * which matters because equal-specificity rules resolve by document order.
 *
 * ## Batch windows — why queuing is safe
 *
 * Deferring a write past React's layout phase would let a `useLayoutEffect`
 * measure an element whose rules are not in the sheet yet, reading the unstyled
 * box. `<TastyBatchProvider>` closes that hole by opening a *window* during its
 * render and closing it — flushing — in its `useInsertionEffect`, which React
 * runs in the mutation phase, before any layout effect:
 *
 *   provider renders          -> window OPEN
 *     children render         -> injections queued
 *   provider insertionEffect  -> FLUSH, window CLOSED
 *   layout effects run        -> rules are in the sheet
 *
 * So in the default (`batchInjection: true`) mode a write is only ever queued
 * inside a commit whose flush is already guaranteed by that same commit. Every
 * injection outside a window — a deep update the provider did not re-render
 * for, a `useLayoutEffect` that injects, an event handler, an async callback —
 * is written straight through, exactly as with batching off.
 *
 * `batchInjection: 'always'` opts out of the gate and queues unconditionally.
 * That wins on more commits, at the cost of the measurement hazard above.
 *
 * ## Flush points (earliest wins)
 *
 * 1. `<TastyBatchProvider>`'s `useInsertionEffect` — closes the window.
 * 2. A microtask — a backstop for a render that was aborted or suspended and
 *    therefore never reached its insertion effect. An aborted render mounts
 *    nothing, so nothing can measure what it queued. Microtasks also always
 *    drain before paint, so styles are never visually missing.
 * 3. `flushStyles()` — explicit, and called internally by every injector read
 *    API (`getCSSText`, `cleanup`, `gc`, `destroy`, ...).
 */

import { isDevEnv } from '../utils/is-dev-env';
import { warn } from '../utils/warnings';

export interface QueuedWrite {
  /** Perform the deferred sheet write. */
  run: () => void;
  /** Set when the owner disposed before the write happened. */
  cancelled: boolean;
  /** Set once the write has been applied (or skipped as cancelled). */
  done: boolean;
}

/**
 * FIFO of pending writes. Drained with a moving `head` index rather than
 * `shift()` so a large batch stays O(n) instead of O(n²).
 */
let queue: QueuedWrite[] = [];
let head = 0;
let microtaskScheduled = false;
let flushing = false;

/**
 * Whether a `<TastyBatchProvider>` has rendered in the current commit and will
 * therefore flush in its insertion effect, making it safe to queue a write.
 *
 * A flag rather than a depth count, because renders and insertion effects do
 * not pair up one-to-one. StrictMode double-invokes render but runs the
 * insertion effect once, so a counter ends the commit stuck above zero — and a
 * window that stays open past its commit turns the next provider-less commit
 * into `'always'` mode behind the user's back, which is exactly the measurement
 * hazard `true` exists to avoid.
 *
 * Clearing on the first close is safe with nested or sibling providers: React
 * finishes every render in a commit before running any insertion effect, so once
 * one closes, no further render-phase injection can arrive in that commit.
 */
let windowOpen = false;
/** Whether any window has ever been opened, i.e. a provider is in the tree. */
let everOpened = false;
/** Dev-only: warn at most once that batching is on with no provider mounted. */
let warnedNoProvider = false;

/**
 * Queue a sheet write.
 *
 * Returns a handle whose `cancel()` drops the write if the caller disposes
 * before the flush. The handle is intentionally tiny — one is allocated per
 * injected class, on the cache-miss path only.
 */
export function enqueueStyleWrite(run: () => void): QueuedWrite {
  // A write triggered by the write currently being drained — an `@property`
  // rule inferred from declarations that are going into the sheet right now —
  // has to land at the position the drain is at, not behind everything already
  // queued after it. Appending would reorder the sheet against unbatched
  // output, so run it in place and hand back an already-done handle.
  if (flushing) {
    run();
    return { run, cancelled: false, done: true };
  }

  const entry: QueuedWrite = { run, cancelled: false, done: false };
  queue.push(entry);
  scheduleMicrotaskFlush();
  return entry;
}

/** Whether any write is still waiting to hit a stylesheet. */
export function hasPendingStyleWrites(): boolean {
  return head < queue.length;
}

/**
 * Open a batch window. Called from `<TastyBatchProvider>`'s render, so every
 * descendant injection in this commit is covered by the provider's insertion
 * effect.
 *
 * Called during render on purpose: the window must be open before children
 * render. It is idempotent — so StrictMode's double render costs nothing — and
 * carries no other side effect. A render that is thrown away is recovered by the
 * microtask backstop.
 *
 * A no-op without a `document`. On the server there is no sheet to batch
 * against, and `useInsertionEffect` never runs, so nothing would ever close a
 * window this opened. Skipping it keeps the provider inert during SSR and RSC
 * instead of merely harmless.
 */
export function openBatchWindow(): void {
  if (typeof document === 'undefined') return;
  windowOpen = true;
  everOpened = true;
}

/**
 * Close a batch window and flush. Called from the provider's
 * `useInsertionEffect`, i.e. after every render in the commit and before any
 * layout effect.
 */
export function closeBatchWindow(): void {
  windowOpen = false;
  flushStyles();
}

/** Whether a batch window is currently open. */
export function isBatchWindowOpen(): boolean {
  return windowOpen;
}

function scheduleMicrotaskFlush(): void {
  if (microtaskScheduled || flushing) return;
  microtaskScheduled = true;
  queueMicrotask(() => {
    microtaskScheduled = false;
    // Normally a no-op: the provider's insertion effect has already drained the
    // queue. This only does work when a render was aborted or suspended before
    // reaching that effect, or when running in `'always'` mode.
    windowOpen = false;
    flushStyles();
  });
}

/**
 * Drain every pending sheet write, in insertion order.
 *
 * Safe to call when the queue is empty (the common case, so the guard comes
 * first) and safe to call re-entrantly: a nested `flushStyles()` is a no-op,
 * and work a draining write triggers is written in place by
 * `enqueueStyleWrite` rather than queued behind the rest of the batch.
 */
export function flushStyles(): void {
  if (head >= queue.length) return;
  if (flushing) return;

  flushing = true;
  try {
    // `queue.length` is re-read every iteration so a write appended by anything
    // reachable from `run()` that does not go through `enqueueStyleWrite` still
    // gets drained by this loop instead of waiting for the next flush.
    while (head < queue.length) {
      const entry = queue[head++];
      if (entry.cancelled) {
        entry.done = true;
        continue;
      }
      entry.run();
      entry.done = true;
    }
  } finally {
    queue = [];
    head = 0;
    flushing = false;
  }
}

/**
 * Dev-only: `batchInjection: true` batches nothing unless a window opens, and no
 * window has ever opened, so no provider is in the tree. Called by the injector
 * the first time it declines to batch.
 */
export function warnBatchProviderMissing(): void {
  if (everOpened || warnedNoProvider || !isDevEnv()) return;
  warnedNoProvider = true;
  warn('[Tasty] batchInjection needs <TastyBatchProvider> mounted to batch.');
}

/**
 * Drop every pending write without applying it. Test helper — production code
 * should call `flushStyles()` instead.
 */
export function resetStyleBatch(): void {
  queue = [];
  head = 0;
  microtaskScheduled = false;
  flushing = false;
  windowOpen = false;
  everOpened = false;
  warnedNoProvider = false;
}
