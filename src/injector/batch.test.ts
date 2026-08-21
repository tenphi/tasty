import {
  flushStyles,
  hasPendingStyleWrites,
  openBatchWindow,
  closeBatchWindow,
  resetStyleBatch,
} from './batch';
import { StyleInjector } from './injector';
import { PENDING_RULE_INDEX } from './types';
import type { StyleRule } from './types';

function rule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

/** A rule that gets the generated class prepended, like a real component chunk. */
function classRule(declarations: string, selector = ''): StyleRule {
  return { selector, declarations, needsClassName: true } as StyleRule;
}

function makeInjector(
  batchInjection: boolean | 'always' | undefined,
): StyleInjector {
  return new StyleInjector({ forceTextInjection: true, batchInjection });
}

function cleanDom() {
  document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  document.body.innerHTML = '';
}

describe('batched injection', () => {
  let injector: StyleInjector;

  beforeEach(() => {
    resetStyleBatch();
    cleanDom();
  });

  afterEach(() => {
    injector?.destroy();
    resetStyleBatch();
    cleanDom();
  });

  // -------------------------------------------------------------------------
  // Gating
  // -------------------------------------------------------------------------

  describe('gating', () => {
    it('writes synchronously when disabled', () => {
      injector = makeInjector(undefined);
      injector.inject([rule('.a.a', 'color: red')]);

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toContain('color: red');
    });

    it('writes synchronously in window mode with no window open', () => {
      injector = makeInjector(true);
      injector.inject([rule('.a.a', 'color: red')]);

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toContain('color: red');
    });

    it('defers in window mode while a window is open', () => {
      injector = makeInjector(true);
      openBatchWindow();
      injector.inject([rule('.a.a', 'color: red')]);

      expect(hasPendingStyleWrites()).toBe(true);

      closeBatchWindow();

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toContain('color: red');
    });

    it('defers unconditionally in always mode', () => {
      injector = makeInjector('always');
      injector.inject([rule('.a.a', 'color: red')]);

      expect(hasPendingStyleWrites()).toBe(true);
    });

    it('flushes on a microtask as a backstop', async () => {
      injector = makeInjector('always');
      injector.inject([rule('.a.a', 'color: red')]);

      expect(hasPendingStyleWrites()).toBe(true);

      await Promise.resolve();

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toContain('color: red');
    });

    it('resets a window left open by an aborted render', async () => {
      injector = makeInjector(true);
      // A render that queued work and never reached its insertion effect.
      openBatchWindow();
      injector.inject([rule('.a.a', 'color: red')]);

      await Promise.resolve();

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toContain('color: red');
      // The stale window is gone, so later injections are synchronous again.
      injector.inject([rule('.b.b', 'color: blue')]);
      expect(hasPendingStyleWrites()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Class names stay synchronous
  // -------------------------------------------------------------------------

  describe('class name allocation', () => {
    it('returns the same className batched and unbatched', () => {
      const sync = makeInjector(undefined);
      const syncName = sync.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      }).className;
      sync.destroy();

      injector = makeInjector('always');
      const batchedName = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      }).className;

      expect(batchedName).toBe(syncName);
      expect(batchedName).not.toBe('');
    });

    it('reuses the pending className for a repeat cacheKey', () => {
      injector = makeInjector('always');
      const first = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      });
      const second = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      });

      expect(second.className).toBe(first.className);

      flushStyles();

      // One rule, not two — the second call must not queue the same rules.
      const css = injector.getCSSText();
      expect(css.match(/color: red/g)).toHaveLength(1);
    });

    it('marks a queued className as pending in the registry', () => {
      injector = makeInjector('always');
      const { className } = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      });
      const registry = injector['sheetManager'].getRegistry(document);

      expect(registry.rules.get(className)!.ruleIndex).toBe(PENDING_RULE_INDEX);

      flushStyles();

      expect(registry.rules.get(className)!.ruleIndex).not.toBe(
        PENDING_RULE_INDEX,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Ordering — the reason everything shares one queue
  // -------------------------------------------------------------------------

  describe('ordering', () => {
    // Global rules and component rules are both style rules that take part in
    // the cascade, so their relative order has to survive batching. Raw CSS
    // lives in its own style element, so its position is decided by element
    // order rather than by the queue and is asserted separately.
    const build = (inj: StyleInjector) => {
      inj.injectGlobal([rule('.g1', 'color: g1')]);
      inj.inject([rule('.c1.c1', 'color: c1')]);
      inj.injectGlobal([rule('.g2', 'color: g2')]);
      inj.inject([rule('.c2.c2', 'color: c2')]);
      inj.injectRawCSS('.raw { color: raw; }');
      inj.inject([rule('.c3.c3', 'color: c3')]);
    };

    const order = (css: string) =>
      ['g1', 'c1', 'g2', 'c2', 'c3']
        .map((token) => [token, css.indexOf(`color: ${token}`)] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([token]) => token);

    it('keeps sheet order identical to unbatched output', () => {
      const sync = makeInjector(undefined);
      build(sync);
      const expected = order(sync.getCSSText());
      const expectedRaw = sync.getRawCSSText();
      sync.destroy();

      injector = makeInjector('always');
      build(injector);
      flushStyles();

      expect(order(injector.getCSSText())).toEqual(expected);
      expect(order(injector.getCSSText())).toEqual([
        'g1',
        'c1',
        'g2',
        'c2',
        'c3',
      ]);
      expect(injector.getRawCSSText()).toBe(expectedRaw);
    });

    // An auto-registered `@property` is queued *by* the write being drained, so
    // appending it would push it behind every rule already in the batch. It has
    // to land where the drain is, which is where the unbatched path puts it.
    const buildWithProperty = (inj: StyleInjector) => {
      inj.inject([classRule('--card-gap: 8px')], { cacheKey: 'p1' });
      inj.inject([classRule('color: tail')], { cacheKey: 'p2' });
    };

    it('keeps a nested @property write in place', () => {
      const sync = makeInjector(undefined);
      buildWithProperty(sync);
      const expected = sync.getCSSText();
      sync.destroy();

      injector = makeInjector('always');
      buildWithProperty(injector);
      flushStyles();

      expect(injector.getCSSText()).toBe(expected);
      expect(
        injector.getCSSText().indexOf('@property --card-gap'),
      ).toBeLessThan(injector.getCSSText().indexOf('color: tail'));
    });

    // Nested providers: the inner one closes its window and flushes while the
    // outer one is still open, so the drain runs with batching still on.
    it('keeps order when the flush runs inside a still-open window', () => {
      const sync = makeInjector(undefined);
      buildWithProperty(sync);
      const expected = sync.getCSSText();
      sync.destroy();

      injector = makeInjector(true);
      openBatchWindow();
      openBatchWindow();
      buildWithProperty(injector);
      closeBatchWindow();

      expect(hasPendingStyleWrites()).toBe(false);
      expect(injector.getCSSText()).toBe(expected);

      closeBatchWindow();
    });
  });

  // -------------------------------------------------------------------------
  // Dispose before flush
  // -------------------------------------------------------------------------

  describe('dispose before flush', () => {
    it('cancels a queued component rule', () => {
      injector = makeInjector('always');
      const { className, dispose } = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      });
      dispose();
      flushStyles();

      const registry = injector['sheetManager'].getRegistry(document);
      expect(registry.rules.has(className)).toBe(false);
      expect(injector.getCSSText()).not.toContain('color: red');
    });

    it('keeps the rule when another owner still holds it', () => {
      injector = makeInjector('always');
      const first = injector.inject([rule('', 'color: red')], {
        cacheKey: 'k1',
      });
      injector.inject([rule('', 'color: red')], { cacheKey: 'k1' });
      first.dispose();
      flushStyles();

      expect(injector.getCSSText()).toContain('color: red');
    });

    it('cancels a queued global rule', () => {
      injector = makeInjector('always');
      const { dispose } = injector.injectGlobal([rule('.g', 'color: gone')]);
      dispose();
      flushStyles();

      expect(injector.getCSSText()).not.toContain('color: gone');
    });

    it('cancels queued raw CSS', () => {
      injector = makeInjector('always');
      const { dispose } = injector.injectRawCSS('.raw { color: gone; }');
      dispose();
      flushStyles();

      expect(injector.getRawCSSText()).not.toContain('color: gone');
    });

    it('cancels queued keyframes without deleting a missing rule', () => {
      injector = makeInjector('always');
      const kf = injector.keyframes({
        from: { opacity: 0 },
        to: { opacity: 1 },
      });
      const name = kf.toString();
      expect(name).not.toBe('');

      expect(() => {
        kf.dispose();
        flushStyles();
      }).not.toThrow();

      expect(injector.getCSSText()).not.toContain(name);
    });
  });

  // -------------------------------------------------------------------------
  // Read APIs flush first
  // -------------------------------------------------------------------------

  describe('reads flush pending writes', () => {
    it('getCSSText', () => {
      injector = makeInjector('always');
      injector.inject([rule('.a.a', 'color: red')]);
      expect(injector.getCSSText()).toContain('color: red');
      expect(hasPendingStyleWrites()).toBe(false);
    });

    it('getCSSTextForClasses', () => {
      injector = makeInjector('always');
      const { className } = injector.inject([classRule('color: red')], {
        cacheKey: 'k1',
      });
      expect(injector.getCSSTextForClasses([className])).toContain(
        'color: red',
      );
    });

    it('gc', () => {
      injector = makeInjector('always');
      injector.inject([rule('.a.a', 'color: red')]);
      injector.gc({ force: true });
      expect(hasPendingStyleWrites()).toBe(false);
    });

    it('isPropertyDefined', () => {
      injector = makeInjector('always');
      injector.property('--batched-prop', {
        syntax: '<length>',
        initialValue: '0px',
      });
      expect(injector.isPropertyDefined('--batched-prop')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Produced CSS is byte-identical
  // -------------------------------------------------------------------------

  it('produces the same CSS as the unbatched path', () => {
    const styles: StyleRule[][] = [
      [rule('', 'color: red; padding: 4px')],
      [rule(':hover', 'color: blue')],
      [rule('', 'display: grid; gap: 8px')],
    ];

    const sync = makeInjector(undefined);
    styles.forEach((s, i) => sync.inject(s, { cacheKey: `k${i}` }));
    const expected = sync.getCSSText();
    sync.destroy();

    injector = makeInjector('always');
    styles.forEach((s, i) => injector.inject(s, { cacheKey: `k${i}` }));
    flushStyles();

    expect(injector.getCSSText()).toBe(expected);
  });
});
