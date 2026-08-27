import { StyleInjector } from './injector';
import type { StyleRule } from './types';

function createStyleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

/**
 * Collection follows React commits. A component acquires the classes its render
 * resolved when it mounts and releases them when it unmounts; only a class that
 * was acquired and then fully released can ever be deleted.
 *
 * These exercise the injector directly — `acquire`/`release` stand in for the
 * insertion effect that calls them. `src/style-lifetime.test.tsx` covers the
 * same contract through React.
 */
describe('GC: acquire / release / gc', () => {
  let injector: StyleInjector;

  beforeEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    document.body.innerHTML = '';
    injector = new StyleInjector({
      forceTextInjection: true,
      gc: { releaseInterval: 5, capacity: 3 },
    });
  });

  afterEach(() => {
    injector.destroy();
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    document.body.innerHTML = '';
  });

  /** Describe a class the way a managed render does, without writing it. */
  function describeClass(name: string, declarations = 'color: red') {
    const cacheKey = `key:${name}`;
    const className = injector.resolveChunk(cacheKey).name;
    injector.defineRecipe(className, {
      rules: [createStyleRule(`.${name}.${name}`, declarations)],
      cacheKey,
    });

    return className;
  }

  const registry = () => injector['sheetManager'].getRegistry(document);

  // -------------------------------------------------------------------------
  // acquire / release
  // -------------------------------------------------------------------------

  describe('acquire', () => {
    it('inserts the rules a recipe describes', () => {
      const className = describeClass('a');

      expect(injector.getCSSText()).not.toContain('color: red');

      injector.acquire(className);

      expect(injector.getCSSText()).toContain('color: red');
      expect(registry().committed.get(className)).toBe(1);
    });

    it('counts every holder of the same class', () => {
      const className = describeClass('b');

      injector.acquire(className);
      injector.acquire(className);

      expect(registry().committed.get(className)).toBe(2);
      expect(injector.gc({ force: true })).toBe(0);
    });

    it('acquires every chunk of a space-separated className', () => {
      const first = describeClass('c1', 'color: red');
      const second = describeClass('c2', 'order: 1');

      injector.acquire(`${first} ${second}`);

      expect(registry().committed.get(first)).toBe(1);
      expect(registry().committed.get(second)).toBe(1);
    });

    it('puts back a class that was collected while a render was pending', () => {
      const className = describeClass('d');

      injector.acquire(className);
      injector.release(className);
      expect(injector.gc({ force: true })).toBe(1);
      expect(injector.getCSSText()).not.toContain('color: red');

      // The pending render finally commits.
      injector.acquire(className);

      expect(injector.getCSSText()).toContain('color: red');
    });
  });

  describe('release', () => {
    it('does not delete on the way past', () => {
      const className = describeClass('e');

      injector.acquire(className);
      injector.release(className);

      // Cleanups and setups interleave component by component, so the class a
      // component just dropped may be picked straight back up by the next one.
      expect(injector.getCSSText()).toContain('color: red');
      expect(registry().candidates.has(className)).toBe(true);
    });

    it('only makes a class collectible once every holder is gone', () => {
      const className = describeClass('f');

      injector.acquire(className);
      injector.acquire(className);
      injector.release(className);

      expect(injector.gc({ force: true })).toBe(0);

      injector.release(className);

      expect(injector.gc({ force: true })).toBe(1);
    });

    it('cancels the candidacy when the class is acquired again', () => {
      const className = describeClass('g');

      injector.acquire(className);
      injector.release(className);
      injector.acquire(className);

      expect(registry().candidates.has(className)).toBe(false);
      expect(injector.gc({ force: true })).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // gc
  // -------------------------------------------------------------------------

  describe('gc', () => {
    it('never collects a class no component ever held', () => {
      // A bare computeStyles() or a pinned inject() has no commit to put it
      // back, so it is never a candidate however unused it looks.
      injector.inject([createStyleRule('.loose.loose', 'color: red')]);

      expect(injector.gc({ force: true })).toBe(0);
      expect(injector.getCSSText()).toContain('color: red');
    });

    it('never collects a pinned class', () => {
      const cacheKey = 'key:pinned';
      const { className } = injector.inject(
        [createStyleRule('.pinned.pinned', 'color: red')],
        { cacheKey },
      );

      injector.acquire(className);
      injector.release(className);

      expect(injector.gc({ force: true })).toBe(0);
    });

    it('should skip when the candidate count is within capacity', () => {
      const className = describeClass('h');

      injector.acquire(className);
      injector.release(className);

      // capacity is 3, 1 candidate → within capacity
      expect(injector.gc()).toBe(0);
    });

    it('should not count held styles against capacity', () => {
      for (let i = 0; i < 5; i++) {
        injector.acquire(describeClass(`held-${i}`, `order: ${i}`));
      }

      expect(injector.gc()).toBe(0);
    });

    it('should evict least recently released first when over capacity', () => {
      const classNames = Array.from({ length: 5 }, (_, i) =>
        describeClass(`lru-${i}`, `order: ${i}`),
      );

      for (const className of classNames) injector.acquire(className);
      for (const className of classNames) injector.release(className);

      // Stagger the release stamps, oldest first
      const now = Date.now();
      classNames.forEach((className, i) => {
        registry().candidates.set(className, now - (5 - i) * 1000);
      });

      // capacity=3, 5 candidates → evict the 2 oldest
      expect(injector.gc()).toBe(2);
      expect(registry().rules.has(classNames[0])).toBe(false);
      expect(registry().rules.has(classNames[1])).toBe(false);
      expect(registry().rules.has(classNames[2])).toBe(true);
      expect(registry().rules.has(classNames[4])).toBe(true);
    });

    it('should return 0 when there is nothing to evict', () => {
      expect(injector.gc()).toBe(0);
    });

    it('should clean up registry entries after eviction', () => {
      const cacheKey = 'key:i';
      const className = injector.resolveChunk(cacheKey).name;
      injector.defineRecipe(className, {
        rules: [createStyleRule('.i.i', 'color: red')],
        cacheKey,
      });

      injector.acquire(className);
      injector.release(className);

      expect(injector.gc({ force: true })).toBe(1);
      expect(registry().rules.has(className)).toBe(false);
      expect(registry().candidates.has(className)).toBe(false);
      expect(registry().cacheKeyToClassName.has(cacheKey)).toBe(false);
    });
  });

  describe('gc({ force: true })', () => {
    it('should remove ALL candidates regardless of capacity', () => {
      const className = describeClass('j');

      injector.acquire(className);
      injector.release(className);

      // capacity is 3 — normally would skip
      expect(injector.gc({ force: true })).toBe(1);
      expect(registry().candidates.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // scheduling
  // -------------------------------------------------------------------------

  describe('scheduling', () => {
    it('schedules a pass once releases reach releaseInterval', () => {
      let scheduled = 0;
      const origRIC = globalThis.requestIdleCallback;
      (globalThis as any).requestIdleCallback = () => ++scheduled;

      for (let i = 0; i < 5; i++) {
        const className = describeClass(`sched-${i}`, `order: ${i}`);
        injector.acquire(className);
        injector.release(className);
      }

      expect(scheduled).toBe(1);

      (globalThis as any).requestIdleCallback = origRIC;
    });

    it('never runs the pass inline', async () => {
      const gcSpy = vi.spyOn(injector, 'gc');
      const origRIC = globalThis.requestIdleCallback;
      delete (globalThis as any).requestIdleCallback;

      for (let i = 0; i < 5; i++) {
        const className = describeClass(`inline-${i}`, `order: ${i}`);
        injector.acquire(className);
        injector.release(className);
      }

      // Releases run inside insertion-effect cleanups; collecting there would
      // race the setups that follow.
      expect(gcSpy).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(gcSpy).toHaveBeenCalled();

      (globalThis as any).requestIdleCallback = origRIC;
    });

    it('should not double-schedule while a pass is pending', () => {
      let callbackCount = 0;
      const origRIC = globalThis.requestIdleCallback;
      (globalThis as any).requestIdleCallback = () => ++callbackCount;

      for (let i = 0; i < 12; i++) {
        const className = describeClass(`double-${i}`, `order: ${i}`);
        injector.acquire(className);
        injector.release(className);
      }

      expect(callbackCount).toBe(1);

      (globalThis as any).requestIdleCallback = origRIC;
    });
  });

  describe('destroy', () => {
    it('should cancel a pending pass on full destroy', () => {
      let cancelledId: number | null = null;
      const origRIC = globalThis.requestIdleCallback;
      const origCIC = globalThis.cancelIdleCallback;
      (globalThis as any).requestIdleCallback = () => 42;
      (globalThis as any).cancelIdleCallback = (id: number) => {
        cancelledId = id;
      };

      for (let i = 0; i < 5; i++) {
        const className = describeClass(`destroy-${i}`, `order: ${i}`);
        injector.acquire(className);
        injector.release(className);
      }

      injector.destroy();

      expect(cancelledId).toBe(42);
      expect(injector['cancelPendingGC']).toBeNull();

      (globalThis as any).requestIdleCallback = origRIC;
      (globalThis as any).cancelIdleCallback = origCIC;
    });
  });
});
