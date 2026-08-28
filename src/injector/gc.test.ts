import { StyleInjector } from './injector';
import type { StyleRule } from './types';

function createStyleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('GC: touch / gc', () => {
  let injector: StyleInjector;

  beforeEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    document.body.innerHTML = '';
    injector = new StyleInjector({
      forceTextInjection: true,
      // `grace: 0` for the collection tests: the window is what stops a class
      // being taken the moment it is created, and has its own suite below.
      gc: { touchInterval: 5, capacity: 3, grace: 0 },
    });
  });

  afterEach(() => {
    injector.destroy();
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // touch
  // -------------------------------------------------------------------------

  describe('touch', () => {
    it('schedules a sweep every touchInterval renders', () => {
      let scheduled = 0;
      const origRIC = globalThis.requestIdleCallback;
      (globalThis as any).requestIdleCallback = () => ++scheduled;

      // touchInterval is 5
      for (let i = 0; i < 5; i++) injector.touch('t0');

      expect(scheduled).toBe(1);

      (globalThis as any).requestIdleCallback = origRIC;
    });

    it('does nothing without gc configured', () => {
      const plain = new StyleInjector({ forceTextInjection: true });
      let scheduled = 0;
      const origRIC = globalThis.requestIdleCallback;
      (globalThis as any).requestIdleCallback = () => ++scheduled;

      for (let i = 0; i < 50; i++) plain.touch('t0');

      expect(scheduled).toBe(0);

      (globalThis as any).requestIdleCallback = origRIC;
      plain.destroy();
    });

    it('tracks nothing per class — the sweep decides what is wanted', () => {
      const registry = injector['sheetManager'].getRegistry(document);

      injector.touch('t0 t1 t2');

      // No per-class bookkeeping on the render path at all: one counter.
      expect(registry.touchCount).toBe(1);
      expect(registry.unusedSince.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // gc
  // -------------------------------------------------------------------------

  describe('gc', () => {
    it('should skip when unused count is within capacity', () => {
      const { className, dispose } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);
      injector.touch(className);
      dispose();

      // capacity is 3, 1 unused entry → within capacity
      const swept = injector.gc();
      expect(swept).toBe(0);
    });

    it('should not count pinned styles against capacity', () => {
      const classNames: string[] = [];

      // Create 5 styles, all pinned
      for (let i = 0; i < 5; i++) {
        const { className } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        classNames.push(className);
        injector.touch(className);
      }

      // capacity=3, but all 5 are pinned → 0 unused → skip
      const swept = injector.gc();
      expect(swept).toBe(0);
    });

    it('should evict oldest unused styles when over capacity', () => {
      const classNames: string[] = [];
      const disposeFns: (() => void)[] = [];
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        const { className, dispose } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        classNames.push(className);
        disposeFns.push(dispose);
      }

      const registry = injector['sheetManager'].getRegistry(document);

      // Stagger when each was last seen (oldest first)
      for (let i = 0; i < 5; i++) {
        registry.unusedSince.set(classNames[i], now - (5 - i) * 1000);
      }

      // Dispose all so they are eligible for GC
      for (const dispose of disposeFns) {
        dispose();
      }

      // capacity=3, 5 unused → should evict 2 oldest
      const swept = injector.gc();

      expect(swept).toBe(2);
      // The two oldest (classNames[0], classNames[1]) should be gone
      expect(registry.rules.has(classNames[0])).toBe(false);
      expect(registry.rules.has(classNames[1])).toBe(false);
      // The three newest should remain
      expect(registry.rules.has(classNames[2])).toBe(true);
      expect(registry.rules.has(classNames[3])).toBe(true);
      expect(registry.rules.has(classNames[4])).toBe(true);
    });

    it('should never evict styles currently in the DOM', () => {
      const { className, dispose } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      dispose();

      // Put the className in the DOM
      const el = document.createElement('div');
      el.className = className;
      document.body.appendChild(el);

      const swept = injector.gc({ force: true });

      expect(swept).toBe(0);
    });

    it('should never evict pinned styles', () => {
      // Create 5 styles, all pinned (not disposed)
      for (let i = 0; i < 5; i++) {
        const { className } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        injector.touch(className);
      }

      const swept = injector.gc({ force: true });

      expect(swept).toBe(0);
    });

    it('should return 0 when there is nothing to evict', () => {
      const swept = injector.gc();
      expect(swept).toBe(0);
    });

    it('should clean up registry entries after eviction', () => {
      const { className, dispose } = injector.inject(
        [createStyleRule('.t0.t0', 'color: red')],
        { cacheKey: 'test-key' },
      );

      injector.touch(className);
      dispose();

      // Force-evict
      const swept = injector.gc({ force: true });

      expect(swept).toBe(1);
      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.rules.has(className)).toBe(false);
      expect(registry.cacheKeyToClassName.has('test-key')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // gc({ force: true })
  // -------------------------------------------------------------------------

  describe('gc({ force: true })', () => {
    it('should remove ALL unused styles regardless of capacity', () => {
      const { className, dispose } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);
      injector.touch(className);
      dispose();

      // one candidate, capacity is 3 — normally would skip
      const swept = injector.gc({ force: true });

      expect(swept).toBe(1);
      expect(
        injector['sheetManager'].getRegistry(document).rules.has(className),
      ).toBe(false);
    });

    it('should still protect DOM-live and pinned styles', () => {
      const r1 = injector.inject([createStyleRule('.t0.t0', 'color: red')]);
      const r2 = injector.inject([createStyleRule('.t1.t1', 'color: blue')]);
      const { className: c3, dispose: d3 } = injector.inject([
        createStyleRule('.t2.t2', 'color: green'),
      ]);

      injector.touch(r1.className);
      injector.touch(r2.className);
      injector.touch(c3);

      // r1: pinned (not disposed)
      // r2: in DOM
      r2.dispose();
      const el = document.createElement('div');
      el.className = r2.className;
      document.body.appendChild(el);
      // c3: disposed, not in DOM → evictable
      d3();

      const swept = injector.gc({ force: true });

      expect(swept).toBe(1);
      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.rules.has(r1.className)).toBe(true);
      expect(registry.rules.has(r2.className)).toBe(true);
      expect(registry.rules.has(c3)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // grace
  // -------------------------------------------------------------------------

  describe('grace', () => {
    function graceInjector(grace: number) {
      return new StyleInjector({
        forceTextInjection: true,
        gc: { touchInterval: 5, capacity: 0, grace },
      });
    }

    it('leaves a class alone while it is still within the window', () => {
      const graced = graceInjector(10_000);
      const { dispose } = graced.inject([
        createStyleRule('.fresh.fresh', 'color: red'),
      ]);
      dispose();

      // Nothing carries it and nothing pins it, but it was wanted a moment ago:
      // a render that resolved it may not have committed yet.
      expect(graced.gc({ force: true })).toBe(0);

      graced.destroy();
    });

    it('collects it once the window has passed', () => {
      const graced = graceInjector(10_000);
      const { className, dispose } = graced.inject([
        createStyleRule('.stale.stale', 'color: red'),
      ]);
      dispose();

      const registry = graced['sheetManager'].getRegistry(document);
      registry.unusedSince.set(className, Date.now() - 20_000);

      expect(graced.gc({ force: true })).toBe(1);

      graced.destroy();
    });

    it('starts the window when a sweep notices, not before', () => {
      const graced = graceInjector(10_000);
      const { className, dispose } = graced.inject([
        createStyleRule('.noticed.noticed', 'color: red'),
      ]);
      dispose();

      const registry = graced['sheetManager'].getRegistry(document);
      // As if it had been rendered all along and only just came off the page:
      // no stamp, because nothing was watching for the moment it went.
      registry.unusedSince.delete(className);

      // The sweep that first looks and does not find it must not take it — it
      // has no idea whether that happened an hour ago or a millisecond ago.
      expect(graced.gc({ force: true })).toBe(0);
      expect(Date.now() - registry.unusedSince.get(className)!).toBeLessThan(
        1_000,
      );

      graced.destroy();
    });

    it('marks a cold class hot again when a render reuses it', () => {
      const graced = graceInjector(10_000);
      const { className, dispose } = graced.inject(
        [createStyleRule('.reused.reused', 'color: red')],
        { cacheKey: 'reuse-key' },
      );
      dispose();

      const registry = graced['sheetManager'].getRegistry(document);
      registry.unusedSince.set(className, Date.now() - 60_000);

      // A render asks for the same styles and gets the cached class back. It
      // may not commit for a while, so the class has to leave the eviction
      // bands again.
      graced.inject([createStyleRule('.reused.reused', 'color: red')], {
        cacheKey: 'reuse-key',
      });

      expect(graced.gc({ force: true })).toBe(0);
      expect(registry.rules.has(className)).toBe(true);

      graced.destroy();
    });

    it('refreshes the window every time a sweep finds the class rendered', () => {
      const graced = graceInjector(10_000);
      const { className, dispose } = graced.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);
      dispose();

      const registry = graced['sheetManager'].getRegistry(document);
      registry.unusedSince.set(className, Date.now() - 20_000);

      const el = document.createElement('div');
      el.className = className;
      document.body.appendChild(el);

      // The sweep sees it live, so it is wanted now — and stays untouchable
      // for a full window after it leaves.
      expect(graced.gc({ force: true })).toBe(0);
      el.remove();
      expect(graced.gc({ force: true })).toBe(0);

      expect(Date.now() - registry.unusedSince.get(className)!).toBeLessThan(
        1_000,
      );

      graced.destroy();
    });
  });

  describe('destroy', () => {
    it('should cancel pending GC on full destroy', () => {
      let cancelledId: number | null = null;
      const origRIC = globalThis.requestIdleCallback;
      const origCIC = globalThis.cancelIdleCallback;
      (globalThis as any).requestIdleCallback = () => 42;
      (globalThis as any).cancelIdleCallback = (id: number) => {
        cancelledId = id;
      };

      // Reach the touch interval so a GC is pending
      for (let i = 0; i < 5; i++) {
        const { className, dispose } = injector.inject([
          createStyleRule(`.destroy-${i}`, `order: ${i}`),
        ]);
        injector.touch(className);
        dispose();
      }

      injector.destroy();

      expect(cancelledId).toBe(42);
      expect(injector['cancelPendingGC']).toBeNull();

      (globalThis as any).requestIdleCallback = origRIC;
      (globalThis as any).cancelIdleCallback = origCIC;
    });
  });
});
