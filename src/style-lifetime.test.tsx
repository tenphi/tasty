import { cleanup as unmountAll, render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { tastyDebug } from './debug';
import { cleanup, destroy, gc, getCSSText, inject, injector } from './injector';
import { HYDRATED_RULE_INDEX } from './injector/types';
import type { RootRegistry, StyleRule } from './injector/types';
import { hydrateTastyClasses } from './ssr/hydrate';

/**
 * How long an injected style lives, and who gets to say so.
 *
 * The render path keeps no dispose handle — a hook-free render has no unmount
 * signal — so the DOM is the only record that a class is in use, and a pin from
 * `inject()` overrides that. Three consumers read this: `gc()` evicts on it,
 * `getMetrics()` counts it, `tastyDebug` reports it.
 *
 * They all went quietly dead once, when the render path stopped disposing and
 * every one of them kept reading "unused" off the pin counts. Nothing failed —
 * GC swept zero, `cleanup()` deleted nothing, and `tastyDebug` printed
 * `Unused: 0 classes` on a page holding hundreds of stale rules. The suites
 * below are written to fail loudly if any part of that contract slips again:
 * the "every reporter agrees" block in particular exists so the three can never
 * drift apart in silence.
 */

const RICH_STYLES = {
  display: 'flex',
  padding: '2x',
  fill: {
    '': '#white',
    hovered: '#purple.10',
  },
  color: '#dark',
  radius: '1r',
  border: '#border',
  Content: {
    color: '#purple',
  },
} as const;

function Box(props: { color: string }) {
  const { className } = computeStyles({ color: props.color });
  return <div className={className} />;
}

function getRegistry(root: Document | ShadowRoot = document): RootRegistry {
  return injector.instance._sheetManager.getRegistry(root);
}

/** Class names the injector holds CSS for in `root`. */
function ownedClasses(root: Document | ShadowRoot = document): string[] {
  const registry = getRegistry(root);

  return [...registry.rules]
    .filter(([, info]) => info.sheetIndex >= 0)
    .map(([className]) => className)
    .sort();
}

function domClasses(container: ParentNode): string[] {
  return [...container.querySelectorAll('[class]')]
    .flatMap((el) => el.className.split(' '))
    .filter(Boolean)
    .sort();
}

/** Resolve once the next scheduled sweep has run on `root`. */
async function nextSweep(root: Document | ShadowRoot = document) {
  const registry = getRegistry(root);
  const before = registry.sweepCount;

  await vi.waitFor(() => expect(registry.sweepCount).toBeGreaterThan(before), {
    timeout: 5000,
  });
}

/** Render a style nothing else has used, so the touch definitely schedules. */
function renderFreshStyle(index: number) {
  return computeStyles({ color: FRESH_COLORS[index] });
}

const FRESH_COLORS = ['#gold', '#navy', '#teal', '#maroon', '#olive', '#plum'];

function styleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('style lifetime', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it('pins nothing when styles come from the render path', () => {
    render(<Box color="#red" />);

    const registry = getRegistry();

    expect(registry.rules.size).toBeGreaterThan(0);
    expect(registry.pinCounts.size).toBe(0);
  });

  it('never evicts a class that is still rendered', () => {
    const { container } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    expect(gc({ force: true })).toBe(0);
    expect(getCSSText()).toContain(className);
  });

  it('evicts a class once it leaves the DOM', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);

    expect(gc({ force: true })).toBe(1);

    const registry = getRegistry();
    expect(registry.rules.has(className)).toBe(false);
    expect(registry.usageMap.has(className)).toBe(false);
    expect(getCSSText()).not.toContain(className);
  });

  it('drops the cache key so the class can be re-injected later', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);
    gc({ force: true });

    const second = render(<Box color="#red" />);

    expect(second.container.firstElementChild!.className).toBe(className);
    expect(getCSSText()).toContain(className);
  });

  it('keeps the most recently used classes within capacity', () => {
    configure({ gc: { touchInterval: 1_000_000, capacity: 1 } });

    const { rerender } = render(
      <>
        <Box color="#red" />
        <Box color="#blue" />
        <Box color="#green" />
      </>,
    );

    const registry = getRegistry();
    const injected = registry.rules.size;
    expect(injected).toBe(3);

    rerender(<div />);

    expect(gc()).toBe(injected - 1);
    expect(registry.rules.size).toBe(1);
  });

  it('cleanup() removes detached render-path styles', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);
    cleanup();

    expect(getCSSText()).not.toContain(className);
  });

  it('keeps styles an inject() caller pinned', () => {
    const { className } = inject([styleRule('.pinned.pinned', 'color: red')]);

    expect(gc({ force: true })).toBe(0);
    expect(getRegistry().rules.has(className)).toBe(true);
  });

  it('never reports a pinned class as unused', () => {
    const { className } = inject([styleRule('.held.held', 'color: red')]);

    // Not merely undeleted — a pinned class must not be *counted* as unused
    // either, or it eats into the GC capacity and shows up in debug output.
    expect(injector.instance.getUnusedClasses()).not.toContain(className);
    expect(tastyDebug.summary({ raw: true }).unusedClasses).not.toContain(
      className,
    );
  });

  it('collects an unpinned inject() once nothing renders it', () => {
    const { className } = inject([styleRule('.loose.loose', 'color: red')], {
      pin: false,
    });

    expect(getRegistry().pinCounts.has(className)).toBe(false);
    expect(gc({ force: true })).toBe(1);
    expect(getRegistry().rules.has(className)).toBe(false);
  });

  it('never evicts server-rendered classes it does not own', () => {
    hydrateTastyClasses(['t-hydrated']);

    const registry = getRegistry();
    expect(registry.rules.get('t-hydrated')?.sheetIndex).toBe(
      HYDRATED_RULE_INDEX,
    );

    expect(gc({ force: true })).toBe(0);
    expect(registry.rules.has('t-hydrated')).toBe(true);
    // And not merely undeleted: the CSS lives in the server's <style> tag, so
    // this injector must not claim it as unused either.
    expect(injector.instance.getUnusedClasses()).not.toContain('t-hydrated');
  });

  it('collects on its own once the touch interval is reached', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { container, rerender } = render(<Box color="#blue" />);
    const mounted = domClasses(container)[0];

    // No manual gc() call: rendering alone has to get the sweep scheduled. The
    // first sweep sees the class mounted, which is what lets a later one judge
    // it. Each rerender swaps in a colour the registry has not seen, so every
    // pass is a fresh class name and a guaranteed touch — `touch()` skips
    // repeats of the same name inside one millisecond, which would otherwise
    // make this timing-bound.
    await nextSweep();

    rerender(<Box color="#red" />);
    await nextSweep();

    expect(getRegistry().rules.has(mounted)).toBe(false);
  });

  // The DOM scan is the only commit signal a hook-free render path offers, so
  // this is the price of never evicting work in flight. The class stays cached
  // — still reused on the next render — and any explicit collection takes it.
  it('leaves a class no sweep ever saw to an explicit cleanup', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { container, rerender } = render(<Box color="#blue" />);
    const shortLived = domClasses(container)[0];

    // Mounted and gone again before any sweep could look.
    rerender(<Box color="#red" />);
    await nextSweep();

    // And it stays: no later sweep can tell it apart from a render in flight.
    renderFreshStyle(0);
    await nextSweep();

    expect(getRegistry().rules.has(shortLived)).toBe(true);

    cleanup();

    expect(getRegistry().rules.has(shortLived)).toBe(false);
  });

  it('collects everything a rich style object produced', () => {
    function Rich() {
      const { className } = computeStyles(RICH_STYLES);
      return <div className={className} />;
    }

    const { container, rerender } = render(<Rich />);
    const rendered = domClasses(container);

    // Several chunks, or this proves less than it looks.
    expect(rendered.length).toBeGreaterThan(1);
    expect(ownedClasses()).toEqual(rendered);

    rerender(<div />);
    gc({ force: true });

    expect(ownedClasses()).toEqual([]);
    for (const className of rendered) {
      expect(getCSSText()).not.toContain(className);
    }
  });

  it('honours a custom namePrefix when scanning the DOM', () => {
    configure({ namePrefix: 'zz' });

    const { container, rerender } = render(<Box color="#red" />);
    const rendered = domClasses(container);

    expect(rendered[0]).toMatch(/^zz/);
    // A DOM scan that still looked for the default prefix would collect these.
    expect(gc({ force: true })).toBe(0);

    rerender(<div />);

    expect(gc({ force: true })).toBe(rendered.length);
  });

  it('scopes collection to the root it was given', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    const shadow = computeStyles({ color: '#red' }, { root: shadowRoot });
    const shadowEl = document.createElement('div');
    shadowEl.className = shadow.className;
    shadowRoot.appendChild(shadowEl);

    render(<Box color="#blue" />);

    // Each root only ever judges its own classes.
    expect(gc({ root: shadowRoot, force: true })).toBe(0);
    expect(gc({ force: true })).toBe(0);

    shadowEl.remove();

    expect(gc({ force: true })).toBe(0);
    expect(gc({ root: shadowRoot, force: true })).toBe(1);
    expect(ownedClasses(shadowRoot)).toEqual([]);

    host.remove();
  });
});

// ---------------------------------------------------------------------------
// Rendering is not commit-aware. `computeStyles()` injects and touches during
// the render phase; the element carrying the class lands in the DOM only at
// commit, and a concurrent render can yield in between. The scheduled sweep
// fires on its own schedule and can land in exactly that gap, where "no element
// carries this class" means "not yet" rather than "never again".
// ---------------------------------------------------------------------------

describe('a render still in flight', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it.each([
    ['idle callback', false],
    ['timeout fallback', true],
  ])(
    'keeps the class the sweep was scheduled by (%s)',
    async (_label, dropIdleCallback) => {
      const originalIdleCallback = globalThis.requestIdleCallback;
      if (dropIdleCallback) {
        delete (globalThis as { requestIdleCallback?: unknown })
          .requestIdleCallback;
      }

      try {
        configure({ gc: { touchInterval: 1, capacity: 0 } });

        // Render phase: the class is injected and touched — which schedules the
        // sweep — and then the render yields before React commits.
        const { className } = computeStyles({ color: '#red' });

        await nextSweep();

        // Commit finally lands. The rules it needs have to still be there.
        const el = document.createElement('div');
        el.className = className;
        document.body.appendChild(el);

        expect(getRegistry().rules.has(className)).toBe(true);
        expect(getCSSText()).toContain(className);

        el.remove();
      } finally {
        globalThis.requestIdleCallback = originalIdleCallback;
      }
    },
  );

  it('keeps it for as long as the render stays pending', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { className } = computeStyles({ color: '#red' });

    // Concurrent work can stay pending across an unbounded number of turns, so
    // no count of sweeps may run out on it. Each fresh style keeps other
    // renders — and therefore sweeps — coming.
    for (let i = 0; i < 4; i++) {
      renderFreshStyle(i);
      await nextSweep();
      expect(getRegistry().rules.has(className)).toBe(true);
    }

    // The commit finally lands, and it has to land styled.
    const el = document.createElement('div');
    el.className = className;
    document.body.appendChild(el);

    expect(getCSSText()).toContain(className);
    el.remove();
  });

  it('collects it once a sweep has seen it in the DOM and it leaves', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { className } = computeStyles({ color: '#red' });
    const el = document.createElement('div');
    el.className = className;
    document.body.appendChild(el);

    // A sweep sees it live — that sighting is what makes it judgeable later.
    renderFreshStyle(0);
    await nextSweep();
    expect(getRegistry().rules.has(className)).toBe(true);

    el.remove();

    renderFreshStyle(1);
    await nextSweep();

    expect(getRegistry().rules.has(className)).toBe(false);
  });

  it('still collects immediately when gc() is called explicitly', () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { className } = computeStyles({ color: '#red' });

    // The grace period covers the sweep that runs on its own schedule. A call
    // the caller just made is a decision, not a collision.
    expect(gc({ force: true })).toBeGreaterThan(0);
    expect(getRegistry().rules.has(className)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The anti-drift suite: gc(), getMetrics() and tastyDebug must never disagree
// about which classes are unused. Each of them broke independently last time.
// ---------------------------------------------------------------------------

describe('every reporter agrees on what is unused', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  function renderThenDetachSome() {
    const view = render(
      <>
        <Box color="#red" />
        <Box color="#blue" />
        <Box color="#green" />
      </>,
    );

    view.rerender(<Box color="#red" />);

    return view;
  }

  it('tastyDebug reports exactly what the injector calls unused', () => {
    renderThenDetachSome();

    const debugUnused = tastyDebug.summary({ raw: true }).unusedClasses;
    const injectorUnused = injector.instance.getUnusedClasses();

    expect(debugUnused.length).toBeGreaterThan(0);
    expect([...debugUnused].sort()).toEqual([...injectorUnused].sort());
  });

  it('tastyDebug reports exactly what a forced gc() then deletes', () => {
    renderThenDetachSome();

    const before = tastyDebug.summary({ raw: true });

    // Guard the assertion below against passing on two empty lists.
    expect(before.unusedClasses.length).toBeGreaterThan(0);
    expect(gc({ force: true })).toBe(before.unusedClasses.length);

    const after = tastyDebug.summary({ raw: true });

    expect(after.unusedClasses).toEqual([]);
    // Collection must not disturb what is still on screen.
    expect(after.activeClasses).toEqual(before.activeClasses);
  });

  it('accounts for every class the injector holds', () => {
    renderThenDetachSome();

    const summary = tastyDebug.summary({ raw: true });

    // This is the invariant the reported bug violated: the summary claimed 271
    // classes while the chunk breakdown listed 379, and nothing noticed.
    expect([...summary.totalStyledClasses].sort()).toEqual(ownedClasses());

    const chunked = Object.values(summary.chunkBreakdown.byChunk)
      .flatMap((chunk) => chunk.classes)
      .sort();

    expect(chunked).toEqual(ownedClasses());
  });

  it('counts the same classes in metrics as it lists in the summary', () => {
    configure({ devMode: true });
    renderThenDetachSome();

    const summary = tastyDebug.summary({ raw: true });

    expect(summary.unusedClasses.length).toBeGreaterThan(0);
    expect(summary.metrics?.unusedHits).toBe(summary.unusedClasses.length);
  });

  it('reports nothing unused once everything is detached and collected', () => {
    const { rerender } = renderThenDetachSome();

    rerender(<div />);
    tastyDebug.cleanup();

    const summary = tastyDebug.summary({ raw: true });

    expect(summary.activeClasses).toEqual([]);
    expect(summary.unusedClasses).toEqual([]);
    expect(summary.totalStyledClasses).toEqual([]);
    expect(ownedClasses()).toEqual([]);
  });
});
