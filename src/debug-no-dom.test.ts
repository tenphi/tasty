import { describe, expect, it, vi } from 'vitest';

import { tastyDebug } from './debug';

/**
 * `tastyDebug` reads the DOM, and every reader used to take `document` as a
 * *default parameter value*. Defaults are evaluated per call, so on a server —
 * SSR, a Node REPL, a Vitest node project — five of the eight public methods
 * threw `ReferenceError: document is not defined` instead of returning
 * nothing. This suite runs in the Node project (no DOM by construction), so it
 * fails loudly if a `= document` default ever comes back.
 */
describe('tastyDebug without a DOM', () => {
  it('has no document to read', () => {
    expect(typeof document).toBe('undefined');
  });

  // Runs before the warning tests below: `raw` suppresses the notice, so this
  // leaves the once-per-process flag untouched for them.
  it('returns empty results instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
    try {
      expect(tastyDebug.css('active', { raw: true })).toBe('');
      expect(tastyDebug.css('.anything', { raw: true })).toBe('');

      expect(tastyDebug.inspect('.anything', { raw: true })).toEqual({
        element: null,
        classes: [],
        chunks: [],
        css: '',
        size: 0,
        rules: 0,
      });

      const summary = tastyDebug.summary({ raw: true });
      expect(summary.activeClasses).toEqual([]);
      expect(summary.unusedClasses).toEqual([]);
      expect(summary.totalRuleCount).toBe(0);
      expect(summary.totalCSSSize).toBe(0);
      expect(summary.metrics).toBeNull();
      // Precompiled coverage is reported off the same DOM read, so it has to
      // come back empty rather than half-populated from the registry.
      expect(summary.precompiledClasses).toEqual([]);
      expect(summary.precompiledActiveClasses).toEqual([]);
      expect(summary.precompiledInactiveClasses).toEqual([]);
      expect(summary.precompiledUsedClasses).toEqual([]);
      expect(summary.runtimeActiveClasses).toEqual([]);
      expect(summary.precompiledManifestCount).toBe(0);
      expect(summary.precompiledCSSSize).toBe(0);
      expect(summary.precompiledRuleCount).toBe(0);

      expect(tastyDebug.chunks({ raw: true })).toEqual({
        byChunk: {},
        totalChunkTypes: 0,
        totalClasses: 0,
      });

      const cache = tastyDebug.cache({ raw: true });
      expect(cache.classes).toEqual({
        active: [],
        unused: [],
        all: [],
        runtimeActive: [],
        precompiledActive: [],
        precompiledInactive: [],
        precompiledUsed: [],
      });
      expect(cache.metrics).toBeNull();

      expect(() => tastyDebug.cleanup()).not.toThrow();
      expect(() => tastyDebug.install()).not.toThrow();

      // `raw` is the "I'm reading the return value" switch — it must stay
      // silent, including about the missing DOM.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('explains the empty result once, not on every call', () => {
    const silence = () => {
      /* noop */
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(silence);
    const log = vi.spyOn(console, 'log').mockImplementation(silence);
    const group = vi.spyOn(console, 'group').mockImplementation(silence);
    const groupCollapsed = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(silence);
    const groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(silence);
    try {
      tastyDebug.summary();
      tastyDebug.chunks();
      tastyDebug.cache();
      tastyDebug.inspect('.anything');
      tastyDebug.css('active');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('environment has none');
    } finally {
      warn.mockRestore();
      log.mockRestore();
      group.mockRestore();
      groupCollapsed.mockRestore();
      groupEnd.mockRestore();
    }
  });
});
