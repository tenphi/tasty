import { cleanup as unmountAll, render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { tastyDebug } from './debug';
import { cleanup, destroy, gc, getCSSText, inject, injector } from './injector';
import { HYDRATED_RULE_INDEX } from './injector/types';
import type { RootRegistry, StyleRule } from './injector/types';
import type { Styles } from './styles/types';
import { hydrateTastyClasses } from './ssr/hydrate';
import { tasty } from './tasty';

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

function styleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('style lifetime', () => {
  beforeEach(() => {
    // Collection leaves anything used within the grace window alone; that
    // window has its own tests in src/injector/gc.test.ts.
    configure({ gc: { grace: 0 } });
  });

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
    expect(registry.unusedSince.has(className)).toBe(false);
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
    configure({ gc: { touchInterval: 1_000_000, capacity: 1, grace: 0 } });

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

  it('leaves a class alone while it was in use recently', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0 } });

    const { container, rerender } = render(<Box color="#blue" />);
    const detached = domClasses(container)[0];

    rerender(<Box color="#red" />);

    // Nothing carries it now, but it was on the page a moment ago — which is
    // indistinguishable from a render that resolved it and has not committed
    // yet. The grace window covers both.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getRegistry().rules.has(detached)).toBe(true);
  });

  it('collects on its own once the touch interval is reached', async () => {
    configure({ gc: { touchInterval: 1, capacity: 0, grace: 0 } });

    const { container, rerender } = render(<Box color="#blue" />);
    const detached = domClasses(container)[0];

    // No manual gc() call: rendering alone has to get the sweep scheduled. The
    // rerender swaps in a colour the registry has not seen, so it is a fresh
    // class name and a guaranteed touch — `touch()` skips repeats of the same
    // name inside one millisecond, which would make this timing-bound.
    rerender(<Box color="#red" />);

    await vi.waitFor(
      () => expect(getRegistry().rules.has(detached)).toBe(false),
      { timeout: 5000 },
    );
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
// Local @keyframes belong to the classes that animate them: one reference
// however many times they render, released when the last of those classes is
// collected. Injecting per render instead piles up references nobody gives
// back, and leaves the keyframes behind when the rules that used them go.
// ---------------------------------------------------------------------------

describe('local keyframes', () => {
  const FADE_STYLES = {
    animation: 'fade 1s',
    '@keyframes': { fade: { from: { opacity: 0 }, to: { opacity: 1 } } },
  } as Styles;

  function keyframesInSheet(): number {
    return (getCSSText().match(/@keyframes/g) ?? []).length;
  }

  beforeEach(() => {
    configure({ gc: { grace: 0 } });
  });

  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it('takes one reference however many times it renders', () => {
    const Fading = tasty({});
    const { rerender } = render(<Fading styles={FADE_STYLES} />);

    expect(keyframesInSheet()).toBe(1);

    // Instance styles bypass the factory cache, so every rerender runs the
    // whole path again.
    for (let i = 0; i < 5; i++) {
      rerender(<Fading styles={{ ...FADE_STYLES }} />);
    }

    expect(keyframesInSheet()).toBe(1);
  });

  it('names keyframes from their content, and rules follow', () => {
    const Fading = tasty({ styles: FADE_STYLES });
    const { container } = render(<Fading />);

    const [emitted] = [...getCSSText().matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (match) => match[1],
    );

    // Content-addressed, not the bare authored name: that is what lets the
    // server and the client agree on it without coordinating.
    expect(emitted).toMatch(/^fade-[a-z0-9]+$/);
    expect(
      injector.instance.getCSSTextForClasses(domClasses(container)),
    ).toContain(emitted);
  });

  it('does not alias two identical shorthands over different keyframes', () => {
    // Same authored declaration, different animations. An earlier version of
    // this test varied the duration, which changes the chunk key on its own and
    // so proved nothing: keep the shorthand identical and the key has to carry
    // which keyframes the rule ended up animating.
    const First = tasty({ styles: FADE_STYLES });
    const first = render(<First />);

    const Second = tasty({
      styles: {
        animation: 'fade 1s',
        '@keyframes': { fade: { from: { opacity: 1 }, to: { opacity: 0 } } },
      } as Styles,
    });
    const second = render(<Second />);

    const firstClasses = domClasses(first.container);
    const secondClasses = domClasses(second.container);
    expect(secondClasses).not.toEqual(firstClasses);

    const emitted = [...getCSSText().matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (match) => match[1],
    );
    expect(new Set(emitted).size).toBe(2);

    // Each class animates its own definition.
    const firstCSS = injector.instance.getCSSTextForClasses(firstClasses);
    const secondCSS = injector.instance.getCSSTextForClasses(secondClasses);
    const firstName = emitted.find((name) => firstCSS.includes(name))!;
    const secondName = emitted.find((name) => secondCSS.includes(name))!;

    expect(firstName).toBeDefined();
    expect(secondName).toBeDefined();
    expect(firstName).not.toBe(secondName);
  });

  it('gives two animations with identical steps a rule each', () => {
    // `fade` and `spin` describe the same movement. The low-level cache keys
    // keyframes by their steps, so without scoping it by name the second would
    // collapse onto the first and animate nothing.
    const Both = tasty({
      styles: {
        animation: 'fade 1s',
        Content: { animation: 'spin 1s' },
        '@keyframes': {
          fade: { from: { opacity: 0 }, to: { opacity: 1 } },
          spin: { from: { opacity: 0 }, to: { opacity: 1 } },
        },
      } as Styles,
    });
    const { container } = render(<Both />);

    const emitted = [...getCSSText().matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (match) => match[1],
    );
    expect(emitted).toHaveLength(2);

    // Whatever the rules name, a rule of that name has to exist.
    const classCSS = injector.instance.getCSSTextForClasses(
      domClasses(container),
    );
    for (const name of emitted) {
      expect(classCSS).toContain(name);
    }
  });

  it('does not treat crossfade as a use of fade', () => {
    // One component runs `fade` at the root and `crossfade` on Content; a
    // second shares only the crossfade chunk. Matching declaration substrings
    // would make that shared class an owner of `fade` and keep it forever.
    const Both = tasty({
      styles: {
        animation: 'fade 1s',
        Content: { animation: 'crossfade 1s' },
        '@keyframes': {
          fade: { from: { opacity: 0 }, to: { opacity: 1 } },
          crossfade: { from: { opacity: 0.2 }, to: { opacity: 0.8 } },
        },
      } as Styles,
    });
    const Sharing = tasty({
      styles: {
        Content: { animation: 'crossfade 1s' },
        '@keyframes': {
          crossfade: { from: { opacity: 0.2 }, to: { opacity: 0.8 } },
        },
      } as Styles,
    });

    const view = render(
      <>
        <Both />
        <Sharing />
      </>,
    );
    expect(keyframesInSheet()).toBe(2);

    view.rerender(<Sharing />);
    cleanup();

    // `crossfade` stays, `fade` goes: the shared class never ran `fade`.
    expect(getCSSText()).toContain('crossfade');
    expect(keyframesInSheet()).toBe(1);
  });

  it('releases them when the last class animating them is collected', () => {
    const Fading = tasty({ styles: FADE_STYLES });
    const { rerender } = render(<Fading />);

    expect(keyframesInSheet()).toBe(1);

    rerender(<div />);
    cleanup();

    expect(keyframesInSheet()).toBe(0);
  });

  it('is not kept alive by a class that merely rendered alongside', () => {
    // The animated component's colour chunk is shared with a plain one. That
    // shared class does not animate anything, so it must not keep the
    // keyframes alive once the class that does animate them is collected.
    const Animated = tasty({
      styles: { ...FADE_STYLES, color: '#red' } as Styles,
    });
    const Plain = tasty({ styles: { color: '#red' } });

    const view = render(
      <>
        <Animated />
        <Plain />
      </>,
    );

    const shared = domClasses(view.container).filter(
      (className, i, all) => all.indexOf(className) !== i,
    );
    expect(shared.length).toBeGreaterThan(0);
    expect(keyframesInSheet()).toBe(1);

    // Only the animated one goes; the shared colour class stays mounted.
    view.rerender(<Plain />);
    cleanup();

    expect(keyframesInSheet()).toBe(0);
  });

  it('keeps them while another class still animates them', () => {
    const One = tasty({ styles: FADE_STYLES });
    const Two = tasty({ styles: { ...FADE_STYLES, color: '#red' } });
    const { rerender } = render(
      <>
        <One />
        <Two />
      </>,
    );

    expect(keyframesInSheet()).toBe(1);

    rerender(<Two />);
    cleanup();

    expect(keyframesInSheet()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The anti-drift suite: gc(), getMetrics() and tastyDebug must never disagree
// about which classes are unused. Each of them broke independently last time.
// ---------------------------------------------------------------------------

describe('every reporter agrees on what is unused', () => {
  beforeEach(() => {
    configure({ gc: { grace: 0 } });
  });

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

  it('accounts for a class that went cold but is not collectable yet', () => {
    // The default grace leaves a just-detached class in neither the active nor
    // the unused list. Dropping it from the total is the accounting failure
    // this whole change started from.
    resetConfig();
    configure({ gc: {} });

    const { container, rerender } = render(<Box color="#salmon" />);
    const detached = domClasses(container)[0];

    rerender(<div />);

    const summary = tastyDebug.summary({ raw: true });

    expect(summary.activeClasses).not.toContain(detached);
    expect(summary.unusedClasses).not.toContain(detached);
    expect(summary.hotClasses).toContain(detached);
    expect(summary.totalStyledClasses).toContain(detached);
    expect([...summary.totalStyledClasses].sort()).toEqual(ownedClasses());
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
    configure({ devMode: true, gc: { grace: 0 } });
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
