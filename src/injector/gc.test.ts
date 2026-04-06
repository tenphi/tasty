/**
 * @vitest-environment jsdom
 */
import { StyleInjector } from './injector';
import type { StyleRule } from './types';

function createStyleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('GC: touch / gc / maybeGC', () => {
  let injector: StyleInjector;

  beforeEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    document.body.innerHTML = '';
    injector = new StyleInjector({ forceTextInjection: true, gc: {} });
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
    it('should record hitCount and lastUsedAt for a className', () => {
      const { className } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);

      const registry = injector['sheetManager'].getRegistry(document);
      const usage = registry.usageMap.get(className);

      expect(usage).toBeDefined();
      expect(usage!.hitCount).toBe(1);
      expect(usage!.lastUsedAt).toBeGreaterThan(0);
    });

    it('should increment hitCount on repeated touches', () => {
      const { className } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      injector.touch(className);
      injector.touch(className);

      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.usageMap.get(className)!.hitCount).toBe(3);
    });

    it('should throttle lastUsedAt updates within 5s', () => {
      const { className } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      const registry = injector['sheetManager'].getRegistry(document);
      const firstTime = registry.usageMap.get(className)!.lastUsedAt;

      injector.touch(className);
      expect(registry.usageMap.get(className)!.lastUsedAt).toBe(firstTime);
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
  });

  // -------------------------------------------------------------------------
  // gc
  // -------------------------------------------------------------------------

  describe('gc', () => {
    it('should evict styles that exceed their popularity-weighted TTL', () => {
      const { className, dispose } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      dispose(); // refCount → 0, eligible for GC

      // Artificially age the entry
      const registry = injector['sheetManager'].getRegistry(document);
      registry.usageMap.get(className)!.lastUsedAt = Date.now() - 120_000;

      const swept = injector.gc({ baseMaxAge: 60_000 });

      expect(swept).toBe(1);
      expect(registry.usageMap.has(className)).toBe(false);
    });

    it('should keep styles with high hitCount alive longer', () => {
      const { className: lowHit, dispose: disposeLow } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);
      const { className: highHit, dispose: disposeHigh } = injector.inject([
        createStyleRule('.t1.t1', 'color: blue'),
      ]);

      const registry = injector['sheetManager'].getRegistry(document);

      // Low hit: 1 touch
      injector.touch(lowHit);
      // High hit: many touches
      for (let i = 0; i < 50; i++) {
        injector.touch(highHit);
      }

      // Dispose both so they are eligible for GC
      disposeLow();
      disposeHigh();

      // Age both by 90s
      const now = Date.now();
      registry.usageMap.get(lowHit)!.lastUsedAt = now - 90_000;
      registry.usageMap.get(highHit)!.lastUsedAt = now - 90_000;

      const swept = injector.gc({ baseMaxAge: 60_000 });

      // lowHit: effectiveTTL = 60000 * log2(2) = 60000 → 90s > 60s → evicted
      // highHit: effectiveTTL = 60000 * log2(51) ≈ 340s → 90s < 340s → kept
      expect(swept).toBe(1);
      expect(registry.usageMap.has(lowHit)).toBe(false);
      expect(registry.usageMap.has(highHit)).toBe(true);
    });

    it('should never evict styles currently in the DOM', () => {
      const { className, dispose } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(className);
      dispose(); // refCount → 0, but DOM guard should still protect it

      // Put the className in the DOM
      const el = document.createElement('div');
      el.className = className;
      document.body.appendChild(el);

      // Artificially age the entry well past any TTL
      const registry = injector['sheetManager'].getRegistry(document);
      registry.usageMap.get(className)!.lastUsedAt = Date.now() - 999_999;

      const swept = injector.gc({ baseMaxAge: 1 });

      expect(swept).toBe(0);
      expect(registry.usageMap.has(className)).toBe(true);
    });

    it('should never evict styles with refCount > 0', () => {
      const result = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);

      injector.touch(result.className);

      // Artificially age the entry well past any TTL
      const registry = injector['sheetManager'].getRegistry(document);
      registry.usageMap.get(result.className)!.lastUsedAt =
        Date.now() - 999_999;

      // Style still has refCount = 1 (not disposed), so GC must skip it
      const swept = injector.gc({ baseMaxAge: 1 });

      expect(swept).toBe(0);
      expect(registry.usageMap.has(result.className)).toBe(true);
      expect(registry.rules.has(result.className)).toBe(true);
    });

    it('should enforce cacheCapacity by evicting lowest-scored styles', () => {
      const classNames: string[] = [];
      const disposeFns: (() => void)[] = [];
      for (let i = 0; i < 5; i++) {
        const { className, dispose } = injector.inject([
          createStyleRule(`.test-${i}`, `order: ${i}`),
        ]);
        classNames.push(className);
        disposeFns.push(dispose);
        injector.touch(className);
      }

      // Give the first class many more hits (high score)
      for (let i = 0; i < 20; i++) {
        injector.touch(classNames[0]);
      }

      // Dispose all so they are eligible for GC
      for (const dispose of disposeFns) {
        dispose();
      }

      const swept = injector.gc({ cacheCapacity: 2 });

      const registry = injector['sheetManager'].getRegistry(document);

      // Should have evicted down to capacity (2), keeping highest-scored
      expect(swept).toBeGreaterThanOrEqual(3);
      expect(registry.usageMap.size).toBeLessThanOrEqual(2);
      // The most popular one should survive
      expect(registry.usageMap.has(classNames[0])).toBe(true);
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
      dispose(); // refCount → 0

      const registry = injector['sheetManager'].getRegistry(document);
      registry.usageMap.get(className)!.lastUsedAt = Date.now() - 120_000;

      injector.gc({ baseMaxAge: 60_000 });

      // After GC + forceCleanup, the rule and cacheKey mappings should be removed
      expect(registry.rules.has(className)).toBe(false);
      expect(registry.cacheKeyToClassName.has('test-key')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // maybeGC
  // -------------------------------------------------------------------------

  describe('maybeGC', () => {
    it('should skip when called within cooldown', () => {
      // Call maybeGC once to set the lastGCTime
      injector.maybeGC();

      // Spy on gc to verify it's not called again
      const gcSpy = vi.spyOn(injector, 'gc');

      injector.maybeGC();

      // gc should not be called because we're within cooldown
      expect(gcSpy).not.toHaveBeenCalled();
    });

    it('should run gc after cooldown expires', () => {
      // Set lastGCTime to the past
      injector['lastGCTime'] = Date.now() - 60_000;

      // Remove requestIdleCallback to get synchronous gc
      const origRIC = globalThis.requestIdleCallback;
      delete (globalThis as any).requestIdleCallback;

      const gcSpy = vi.spyOn(injector, 'gc');

      injector.maybeGC();

      expect(gcSpy).toHaveBeenCalled();

      (globalThis as any).requestIdleCallback = origRIC;
    });
  });

  // -------------------------------------------------------------------------
  // Background sweep
  // -------------------------------------------------------------------------

  describe('background sweep', () => {
    it('should set up timeout when gc.auto is true', () => {
      const autoInjector = new StyleInjector({
        forceTextInjection: true,
        gc: { auto: true, autoInterval: 1000 },
      });

      expect(autoInjector['backgroundSweepTimeout']).not.toBeNull();

      autoInjector.destroy();
      expect(autoInjector['backgroundSweepTimeout']).toBeNull();
    });

    it('should not set up timeout when gc.auto is false', () => {
      const noAutoInjector = new StyleInjector({
        forceTextInjection: true,
        gc: { auto: false },
      });

      expect(noAutoInjector['backgroundSweepTimeout']).toBeNull();

      noAutoInjector.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // forceCleanup + usageMap interaction
  // -------------------------------------------------------------------------

  describe('forceCleanup respects usageMap', () => {
    it('should not evict GC-kept styles when forceCleanup is called', () => {
      const { className: lowHit, dispose: disposeLow } = injector.inject([
        createStyleRule('.t0.t0', 'color: red'),
      ]);
      const { className: highHit, dispose: disposeHigh } = injector.inject([
        createStyleRule('.t1.t1', 'color: blue'),
      ]);

      const registry = injector['sheetManager'].getRegistry(document);

      // Low hit: 1 touch
      injector.touch(lowHit);
      // High hit: many touches
      for (let i = 0; i < 50; i++) {
        injector.touch(highHit);
      }

      // Dispose both so they are eligible for GC
      disposeLow();
      disposeHigh();

      // Age both by 90s
      const now = Date.now();
      registry.usageMap.get(lowHit)!.lastUsedAt = now - 90_000;
      registry.usageMap.get(highHit)!.lastUsedAt = now - 90_000;

      // GC should only evict lowHit (effectiveTTL ~60s), keep highHit (~340s)
      injector.gc({ baseMaxAge: 60_000 });

      // Now forceCleanup should NOT delete highHit because it's still in usageMap
      expect(registry.usageMap.has(highHit)).toBe(true);
      expect(registry.rules.has(highHit)).toBe(true);

      // lowHit should have been cleaned up
      expect(registry.usageMap.has(lowHit)).toBe(false);
      expect(registry.rules.has(lowHit)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // destroy(root) preserves sweep for other roots
  // -------------------------------------------------------------------------

  describe('destroy(root) preserves sweep', () => {
    it('should not kill background sweep when destroying a specific root', () => {
      const autoInjector = new StyleInjector({
        forceTextInjection: true,
        gc: { auto: true, autoInterval: 1000 },
      });

      expect(autoInjector['backgroundSweepTimeout']).not.toBeNull();

      // The document root is always registered via getRegistry,
      // so destroying a different root should keep the sweep alive
      autoInjector['sheetManager'].getRegistry(document);

      // Create a shadow root to destroy
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      autoInjector['sheetManager'].getRegistry(shadow);

      // Destroy only the shadow root
      autoInjector.destroy(shadow);

      // Background sweep should still be active (document root remains)
      expect(autoInjector['backgroundSweepTimeout']).not.toBeNull();

      // Full destroy clears it
      autoInjector.destroy();
      expect(autoInjector['backgroundSweepTimeout']).toBeNull();

      host.remove();
    });
  });
});
