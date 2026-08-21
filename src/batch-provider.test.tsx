/**
 * The safety property that makes `batchInjection: true` the default-safe mode.
 *
 * Deferring a stylesheet write past React's layout phase would let a
 * `useLayoutEffect` measure an element whose rules are not in the sheet yet and
 * read the unstyled box — the popover/tooltip/virtual-list failure. These tests
 * assert on `getBoundingClientRect()` inside a layout effect, so they fail if
 * that ever regresses; asserting on CSS text would not catch it.
 */
import { render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';

import { TastyBatchProvider } from './batch-provider';
import { configure, resetConfig } from './config';
import { destroy, hasPendingStyleWrites, resetStyleBatch } from './injector';
import { tasty } from './tasty';

const WIDTH = 321;

function cleanDom() {
  document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  document.body.innerHTML = '';
}

describe('TastyBatchProvider', () => {
  beforeEach(() => {
    destroy();
    resetConfig();
    resetStyleBatch();
    cleanDom();
  });

  afterEach(() => {
    destroy();
    resetConfig();
    resetStyleBatch();
    cleanDom();
  });

  /** A component that measures itself in a layout effect, like a popover would. */
  function makeMeasured(record: (width: number) => void) {
    const Box = tasty({ styles: { width: `${WIDTH}px`, height: '10px' } });

    return function Measured() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        record(ref.current!.getBoundingClientRect().width);
      }, []);
      return <Box ref={ref} />;
    };
  }

  it('has styles in the sheet before layout effects run', () => {
    configure({ batchInjection: true });

    let measured = -1;
    const Measured = makeMeasured((w) => {
      measured = w;
    });

    render(
      <TastyBatchProvider>
        <Measured />
      </TastyBatchProvider>,
    );

    expect(measured).toBe(WIDTH);
  });

  it('actually batches — writes are still pending mid-render', () => {
    configure({ batchInjection: true });

    const Box = tasty({ styles: { color: 'rgb(1, 2, 3)' } });
    let pendingMidRender: boolean | null = null;

    function Probe() {
      // Renders after <Box/>, so anything Box queued is still queued here.
      pendingMidRender = hasPendingStyleWrites();
      return null;
    }

    render(
      <TastyBatchProvider>
        <Box />
        <Probe />
      </TastyBatchProvider>,
    );

    expect(pendingMidRender).toBe(true);
    // ...and the insertion effect drained it before the commit finished.
    expect(hasPendingStyleWrites()).toBe(false);
  });

  it('does not batch without the provider, so nothing can be observed unstyled', () => {
    configure({ batchInjection: true });

    const Box = tasty({ styles: { color: 'rgb(1, 2, 3)' } });
    let pendingMidRender: boolean | null = null;

    function Probe() {
      pendingMidRender = hasPendingStyleWrites();
      return null;
    }

    render(
      <>
        <Box />
        <Probe />
      </>,
    );

    expect(pendingMidRender).toBe(false);

    let measured = -1;
    const Measured = makeMeasured((w) => {
      measured = w;
    });
    render(<Measured />);
    expect(measured).toBe(WIDTH);
  });

  it('keeps measurement correct across a re-render under the provider', () => {
    configure({ batchInjection: true });

    const widths: number[] = [];
    const Box = tasty({ styles: { height: '10px' } });

    function Measured({ width }: { width: number }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        widths.push(ref.current!.getBoundingClientRect().width);
      }, [width]);
      return <Box ref={ref} styles={{ width: `${width}px` }} />;
    }

    const { rerender } = render(
      <TastyBatchProvider>
        <Measured width={100} />
      </TastyBatchProvider>,
    );
    rerender(
      <TastyBatchProvider>
        <Measured width={200} />
      </TastyBatchProvider>,
    );

    expect(widths).toEqual([100, 200]);
  });

  // The gate exists because of this: 'always' opts out of it and accepts the
  // hazard. Locking the behaviour down keeps the documented trade-off honest and
  // proves the window in `true` mode is load-bearing rather than decorative.
  it("'always' without a provider can measure an unstyled element", () => {
    configure({ batchInjection: 'always' });

    let measured = -1;
    const Measured = makeMeasured((w) => {
      measured = w;
    });

    render(<Measured />);

    // The layout effect ran before the microtask flush, so it saw a div with no
    // width rule — full container width rather than WIDTH.
    expect(measured).not.toBe(WIDTH);
  });

  it("'always' with a provider measures correctly", () => {
    configure({ batchInjection: 'always' });

    let measured = -1;
    const Measured = makeMeasured((w) => {
      measured = w;
    });

    render(
      <TastyBatchProvider>
        <Measured />
      </TastyBatchProvider>,
    );

    expect(measured).toBe(WIDTH);
  });

  it('renders children unchanged when batching is off', () => {
    let measured = -1;
    const Measured = makeMeasured((w) => {
      measured = w;
    });

    render(
      <TastyBatchProvider>
        <Measured />
      </TastyBatchProvider>,
    );

    expect(measured).toBe(WIDTH);
    expect(hasPendingStyleWrites()).toBe(false);
  });
});
