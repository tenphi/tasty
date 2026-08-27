import { cleanup as unmountAll, render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { tastyDebug } from './debug';
import {
  acquireStyles,
  cleanup,
  destroy,
  gc,
  getCSSText,
  inject,
  injector,
  releaseStyles,
} from './injector';
import { HYDRATED_RULE_INDEX } from './injector/types';
import type { RootRegistry, StyleRule } from './injector/types';
import { hydrateTastyClasses } from './ssr/hydrate';
import { tasty } from './tasty';

/**
 * How long an injected style lives, and who gets to say so.
 *
 * Rendering resolves class names and records what they stand for; the commit
 * puts them in the sheet, through one `useInsertionEffect` per styled
 * component, and the unmount gives them back. Only a class that was held and
 * then fully released can be collected — and because the effect re-inserts
 * whatever is missing, collecting one early costs a re-insert rather than a
 * missing style.
 *
 * This all went quietly dead once, when the render path stopped disposing and
 * `gc()`, `cleanup()`, `getMetrics()` and `tastyDebug` all kept reading "unused"
 * off pin counts nothing maintained: GC swept zero and `tastyDebug` printed
 * `Unused: 0 classes` on a page holding hundreds of stale rules. The suites
 * below fail loudly if any part of that contract slips again.
 */

const RICH_STYLES = {
  display: 'flex',
  padding: '2x',
  fill: { '': '#white', hovered: '#purple.10' },
  color: '#dark',
  radius: '1r',
  border: '#border',
  Content: { color: '#purple' },
} as const;

function Box(props: { color: string }) {
  const Styled =
    BOXES[props.color] ??
    (BOXES[props.color] = tasty({ styles: { color: props.color } }));
  return <Styled />;
}
const BOXES: Record<string, ReturnType<typeof tasty>> = {};

function getRegistry(root: Document | ShadowRoot = document): RootRegistry {
  return injector.instance._sheetManager.getRegistry(root);
}

/** Class names the injector holds CSS for in `root`. */
function ownedClasses(root: Document | ShadowRoot = document): string[] {
  return [...getRegistry(root).rules]
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

function styleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('style lifetime', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it('writes nothing to the sheet until a component commits', () => {
    // Managed rendering only names the class and records what it stands for, so
    // a render that never commits leaves no rule behind.
    const { className } = computeStyles({ color: '#red' }, { managed: true });

    expect(getCSSText()).not.toContain(className);

    acquireStyles(className);

    expect(getCSSText()).toContain(className);
  });

  it('keeps a mounted class', () => {
    const { container } = render(<Box color="#red" />);
    const className = domClasses(container)[0];

    expect(gc({ force: true })).toBe(0);
    expect(getCSSText()).toContain(className);
  });

  it('collects a class once the last holder unmounts', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = domClasses(container)[0];

    rerender(<div />);

    expect(gc({ force: true })).toBe(1);
    expect(getRegistry().rules.has(className)).toBe(false);
    expect(getCSSText()).not.toContain(className);
  });

  it('keeps a class a second component still holds', () => {
    const { rerender } = render(
      <>
        <Box color="#red" />
        <Box color="#red" />
      </>,
    );

    rerender(<Box color="#red" />);

    expect(gc({ force: true })).toBe(0);
  });

  it('re-injects a collected class when a later render mounts it', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = domClasses(container)[0];

    rerender(<div />);
    gc({ force: true });

    const second = render(<Box color="#red" />);

    expect(domClasses(second.container)[0]).toBe(className);
    expect(getCSSText()).toContain(className);
  });

  it('collects everything a rich style object produced', () => {
    const Rich = tasty({ styles: RICH_STYLES });
    const { container, rerender } = render(<Rich />);
    const rendered = domClasses(container);

    // Several chunks, or this proves less than it looks.
    expect(rendered.length).toBeGreaterThan(1);

    rerender(<div />);
    gc({ force: true });

    for (const className of rendered) {
      expect(getRegistry().rules.has(className)).toBe(false);
      expect(getCSSText()).not.toContain(className);
    }
  });

  it('keeps the most recently released classes within capacity', () => {
    configure({ gc: { capacity: 1 } });

    const { rerender } = render(
      <>
        <Box color="#red" />
        <Box color="#blue" />
        <Box color="#green" />
      </>,
    );

    expect(getRegistry().rules.size).toBe(3);

    rerender(<div />);

    expect(gc()).toBe(2);
    expect(getRegistry().rules.size).toBe(1);
  });

  it('cleanup() removes released styles', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = domClasses(container)[0];

    rerender(<div />);
    cleanup();

    expect(getCSSText()).not.toContain(className);
  });

  it('never collects a class no component ever held', () => {
    // A bare computeStyles() has no commit to put it back.
    const { className } = computeStyles({ color: '#red' });

    expect(getCSSText()).toContain(className);
    expect(gc({ force: true })).toBe(0);
    expect(injector.instance.getUnusedClasses()).not.toContain(className);
  });

  it('keeps styles an inject() caller pinned', () => {
    const { className } = inject([styleRule('.pinned.pinned', 'color: red')], {
      cacheKey: 'pinned',
    });

    acquireStyles(className);
    releaseStyles(className);

    expect(gc({ force: true })).toBe(0);
    expect(injector.instance.getUnusedClasses()).not.toContain(className);
  });

  it('never evicts server-rendered classes it does not own', () => {
    hydrateTastyClasses(['t-hydrated']);

    expect(getRegistry().rules.get('t-hydrated')?.sheetIndex).toBe(
      HYDRATED_RULE_INDEX,
    );
    expect(gc({ force: true })).toBe(0);
    expect(injector.instance.getUnusedClasses()).not.toContain('t-hydrated');
  });

  it('scopes collection to the root it was given', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    const shadow = computeStyles(
      { color: '#red' },
      { root: shadowRoot, managed: true },
    );
    acquireStyles(shadow.className, { root: shadowRoot });

    render(<Box color="#blue" />);

    expect(gc({ root: shadowRoot, force: true })).toBe(0);
    expect(gc({ force: true })).toBe(0);

    releaseStyles(shadow.className, { root: shadowRoot });

    expect(gc({ force: true })).toBe(0);
    expect(gc({ root: shadowRoot, force: true })).toBe(1);

    host.remove();
  });
});

// ---------------------------------------------------------------------------
// Rendering is not commit-aware: a concurrent render can yield between the
// render that names a class and the commit that mounts it, for any number of
// turns. Collection cannot tell that apart from a class that is finished, so
// the contract is not that collection avoids it — it is that the commit puts
// the rule back.
// ---------------------------------------------------------------------------

describe('a render still in flight', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it('commits styled even if its class was collected while pending', () => {
    // The render phase resolves a class and yields.
    const { className } = computeStyles({ color: '#red' }, { managed: true });

    // Everything is collected while that render is still pending.
    cleanup();
    expect(getCSSText()).not.toContain(className);

    // The commit finally lands, and puts back what it needs.
    acquireStyles(className);

    expect(getCSSText()).toContain(className);
  });

  it('survives an older element being collected out from under a reuse', () => {
    // Reported in review: a class already mounted, reused by a pending render,
    // then dropped by the older element before that render commits.
    const older = render(<Box color="#red" />);
    const className = domClasses(older.container)[0];

    const pending = computeStyles({ color: '#red' }, { managed: true });
    expect(pending.className).toBe(className);

    older.rerender(<div />);
    cleanup();

    expect(getRegistry().rules.has(className)).toBe(false);

    acquireStyles(className);

    expect(getCSSText()).toContain(className);
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

    expect(before.unusedClasses.length).toBeGreaterThan(0);
    expect(gc({ force: true })).toBe(before.unusedClasses.length);

    const after = tastyDebug.summary({ raw: true });

    expect(after.unusedClasses).toEqual([]);
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

  it('reports nothing unused once everything is unmounted and collected', () => {
    const { rerender } = renderThenDetachSome();

    rerender(<div />);
    tastyDebug.cleanup();

    const summary = tastyDebug.summary({ raw: true });

    expect(summary.activeClasses).toEqual([]);
    expect(summary.unusedClasses).toEqual([]);
    expect(ownedClasses()).toEqual([]);
  });
});
