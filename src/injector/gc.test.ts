/**
 * @vitest-environment jsdom
 */
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
      gc: { touchInterval: 5, capacity: 3 },
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
    it('should record lastTouchedAt for a className', () => {
      const { className } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);

      const registry = injector['sheetManager'].getRegistry(document);
      const usage = registry.usageMap.get(className);

      expect(usage).toBeDefined();
      expect(usage!.lastTouchedAt).toBeGreaterThan(0);
    });

    it('should update lastTouchedAt on repeated touches', () => {
      const { className } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      const registry = injector['sheetManager'].getRegistry(document);
      const firstTime = registry.usageMap.get(className)!.lastTouchedAt;

      // Advance time slightly
      vi.spyOn(Date, 'now').mockReturnValue(firstTime + 100);
      injector.touch(className);
      expect(registry.usageMap.get(className)!.lastTouchedAt).toBe(
        firstTime + 100,
      );
      vi.restoreAllMocks();
    });

    it('should handle space-separated multi-chunk classNames', () => {
      const r1 = injector.inject([createStyleRule('.t0.t0', 'color: red')]);
      const r2 = injector.inject([createStyleRule('.t1.t1', 'color: blue')]);

      injector.touch(`${r1.className} ${r2.className}`);

      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.usageMap.has(r1.className)).toBe(true);
      expect(registry.usageMap.has(r2.className)).toBe(true);
    });

    it('should ignore non-tasty class tokens', () => {
      injector.touch('my-custom-class');
      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.usageMap.size).toBe(0);
    });

    it('should ignore tasty-shaped tokens not in the registry', () => {
      injector.touch('t999');
      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.usageMap.size).toBe(0);
    });

    it('should increment touchCount and schedule GC at touchInterval', () => {
      const gcSpy = vi.spyOn(injector, 'gc');

      // Remove requestIdleCallback so GC runs synchronously
      const origRIC = globalThis.requestIdleCallback;
      delete (globalThis as any).requestIdleCallback;

      // Inject enough styles to exceed capacity
      for (let i = 0; i < 5; i++) {
        const { className, dispose } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        injector.touch(className);
        dispose();
      }

      // touchInterval is 5, and we touched 5 class tokens
      expect(gcSpy).toHaveBeenCalled();

      (globalThis as any).requestIdleCallback = origRIC;
    });

    it('should not double-schedule GC when pendingGCHandle exists', () => {
      let callbackCount = 0;
      const origRIC = globalThis.requestIdleCallback;
      (globalThis as any).requestIdleCallback = (_cb: () => void) => {
        callbackCount++;
        return callbackCount;
      };

      // Inject enough styles to trigger two intervals
      for (let i = 0; i < 12; i++) {
        const { className, dispose } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        injector.touch(className);
        dispose();
      }

      // Should only have scheduled once (second interval sees pending handle)
      expect(callbackCount).toBe(1);

      (globalThis as any).requestIdleCallback = origRIC;
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

    it('should not count active refs against capacity', () => {
      const classNames: string[] = [];

      // Create 5 styles, all actively referenced (refCount > 0)
      for (let i = 0; i < 5; i++) {
        const { className } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        classNames.push(className);
        injector.touch(className);
      }

      // capacity=3, but all 5 are active (refCount > 0) → 0 unused → skip
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

      // Touch all with staggered timestamps (oldest first)
      for (let i = 0; i < 5; i++) {
        registry.usageMap.set(classNames[i], {
          lastTouchedAt: now - (5 - i) * 1000,
        });
      }

      // Dispose all so they are eligible for GC
      for (const dispose of disposeFns) {
        dispose();
      }

      // capacity=3, 5 unused → should evict 2 oldest
      const swept = injector.gc();

      expect(swept).toBe(2);
      expect(registry.usageMap.size).toBeLessThanOrEqual(3);
      // The two oldest (classNames[0], classNames[1]) should be gone
      expect(registry.usageMap.has(classNames[0])).toBe(false);
      expect(registry.usageMap.has(classNames[1])).toBe(false);
      // The three newest should remain
      expect(registry.usageMap.has(classNames[2])).toBe(true);
      expect(registry.usageMap.has(classNames[3])).toBe(true);
      expect(registry.usageMap.has(classNames[4])).toBe(true);
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

    it('should never evict styles with refCount > 0', () => {
      const classNames: string[] = [];
      const now = Date.now();

      // Create 5 styles, all with refCount > 0 (not disposed)
      for (let i = 0; i < 5; i++) {
        const { className } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        classNames.push(className);
      }

      const registry = injector['sheetManager'].getRegistry(document);
      for (let i = 0; i < 5; i++) {
        registry.usageMap.set(classNames[i], {
          lastTouchedAt: now - 999_999,
        });
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

      // usageMap has 1 entry, capacity is 3 — normally would skip
      const swept = injector.gc({ force: true });

      expect(swept).toBe(1);
      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.usageMap.size).toBe(0);
    });

    it('should still protect DOM-live and refCount>0 styles', () => {
      const r1 = injector.inject([createStyleRule('.t0.t0', 'color: red')]);
      const r2 = injector.inject([createStyleRule('.t1.t1', 'color: blue')]);
      const { className: c3, dispose: d3 } = injector.inject([
        createStyleRule('.t2.t2', 'color: green'),
      ]);

      injector.touch(r1.className);
      injector.touch(r2.className);
      injector.touch(c3);

      // r1: refCount > 0 (not disposed)
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
      expect(registry.usageMap.has(r1.className)).toBe(true);
      expect(registry.usageMap.has(r2.className)).toBe(true);
      expect(registry.usageMap.has(c3)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('should cancel pending GC on full destroy', () => {
      let cancelledId: number | null = null;
      const origRIC = globalThis.requestIdleCallback;
      const origCIC = globalThis.cancelIdleCallback;
      (globalThis as any).requestIdleCallback = (_cb: () => void) => 42;
      (globalThis as any).cancelIdleCallback = (id: number) => {
        cancelledId = id;
      };

      // Force a pending GC handle
      injector['pendingGCHandle'] = 42;

      injector.destroy();

      expect(cancelledId).toBe(42);
      expect(injector['pendingGCHandle']).toBeNull();

      (globalThis as any).requestIdleCallback = origRIC;
      (globalThis as any).cancelIdleCallback = origCIC;
    });
  });
});
