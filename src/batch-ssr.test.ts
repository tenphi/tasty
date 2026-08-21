/**
 * `batchInjection` on the server.
 *
 * SSR and RSC collect CSS as text through `ServerStyleCollector` — the runtime
 * `StyleInjector` is never involved (its methods default `root` to `document`,
 * which does not exist there), so there is no sheet to invalidate, nothing to
 * batch and nothing to flush.
 *
 * What can still run on the server is `<TastyBatchProvider>`: it calls
 * `openBatchWindow()` from its render, while its `useInsertionEffect` — the
 * thing that closes the window — never fires. This suite runs in the node
 * project (no `document`) and pins down that the provider leaves no state
 * behind.
 */
import {
  closeBatchWindow,
  hasPendingStyleWrites,
  isBatchWindowOpen,
  openBatchWindow,
  resetStyleBatch,
} from './injector/batch';

describe('batch windows without a document', () => {
  beforeEach(resetStyleBatch);

  it('runs in an environment with no document', () => {
    expect(typeof document).toBe('undefined');
  });

  // Opening has to be a no-op here: nothing on the server ever closes a window,
  // so the count would climb for the life of the process and be shared by every
  // concurrent request.
  it('does not open a window the server can never close', () => {
    openBatchWindow();
    openBatchWindow();

    expect(isBatchWindowOpen()).toBe(false);
    expect(hasPendingStyleWrites()).toBe(false);
  });

  it('survives a stray close', () => {
    expect(() => closeBatchWindow()).not.toThrow();
    expect(isBatchWindowOpen()).toBe(false);
    expect(hasPendingStyleWrites()).toBe(false);
  });
});
