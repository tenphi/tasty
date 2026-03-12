import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../config';
import { allocateClassName, inject, trackRef } from '../injector';

import { collectAutoInferredProperties } from './collect-auto-properties';
import { ServerStyleCollector } from './collector';
import { formatRules } from './format-rules';
import { formatKeyframesCSS } from './format-keyframes';
import { formatPropertyCSS } from './format-property';
import { hydrateTastyCache } from './hydrate';

// ============================================================================
// formatRules
// ============================================================================

describe('formatRules', () => {
  it('formats simple rules with className specificity doubling', () => {
    const css = formatRules(
      [
        {
          selector: '',
          declarations: 'display: flex',
          needsClassName: true,
        },
      ],
      't0',
    );
    expect(css).toBe('.t0.t0 { display: flex }');
  });

  it('formats rules with selectors', () => {
    const css = formatRules(
      [
        {
          selector: ':hover',
          declarations: 'color: red',
          needsClassName: true,
        },
      ],
      't1',
    );
    expect(css).toBe('.t1.t1:hover { color: red }');
  });

  it('handles ||| OR selectors', () => {
    const css = formatRules(
      [
        {
          selector: ':hover|||:focus',
          declarations: 'color: blue',
          needsClassName: true,
        },
      ],
      't2',
    );
    expect(css).toBe('.t2.t2:hover, .t2.t2:focus { color: blue }');
  });

  it('wraps with at-rules', () => {
    const css = formatRules(
      [
        {
          selector: '',
          declarations: 'display: none',
          needsClassName: true,
          atRules: ['@media (max-width: 768px)'],
        },
      ],
      't3',
    );
    expect(css).toBe('@media (max-width: 768px) { .t3.t3 { display: none } }');
  });

  it('handles rootPrefix', () => {
    const css = formatRules(
      [
        {
          selector: '',
          declarations: 'color: white',
          needsClassName: true,
          rootPrefix: ':root[data-theme="dark"]',
        },
      ],
      't4',
    );
    expect(css).toBe(':root[data-theme="dark"] .t4.t4 { color: white }');
  });

  it('merges declarations for same selector', () => {
    const css = formatRules(
      [
        {
          selector: '',
          declarations: 'display: flex',
          needsClassName: true,
        },
        {
          selector: '',
          declarations: 'color: red',
          needsClassName: true,
        },
      ],
      't5',
    );
    expect(css).toBe('.t5.t5 { display: flex color: red }');
  });

  it('returns empty string for empty rules', () => {
    const css = formatRules([], 't6');
    expect(css).toBe('');
  });

  it('handles rules without needsClassName', () => {
    const css = formatRules(
      [
        {
          selector: '.custom',
          declarations: 'color: green',
        },
      ],
      't7',
    );
    expect(css).toBe('.custom { color: green }');
  });
});

// ============================================================================
// formatKeyframesCSS
// ============================================================================

describe('formatKeyframesCSS', () => {
  it('formats raw string keyframes steps', () => {
    const css = formatKeyframesCSS('fadeIn', {
      from: 'opacity: 0',
      to: 'opacity: 1',
    });
    expect(css).toBe(
      '@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }',
    );
  });
});

// ============================================================================
// formatPropertyCSS
// ============================================================================

describe('formatPropertyCSS', () => {
  it('formats a regular property', () => {
    const css = formatPropertyCSS('$rotation', {
      syntax: '<angle>',
      inherits: false,
      initialValue: '0deg',
    });
    expect(css).toContain('@property --rotation');
    expect(css).toContain('syntax: "<angle>"');
    expect(css).toContain('inherits: false');
    expect(css).toContain('initial-value: 0deg');
  });

  it('formats a color property with companion -rgb', () => {
    const css = formatPropertyCSS('#accent', {
      initialValue: 'rgb(128 0 255)',
    });
    expect(css).toContain('@property --accent-color');
    expect(css).toContain('syntax: "<color>"');
    expect(css).toContain('@property --accent-color-rgb');
    expect(css).toContain('syntax: "<number>+"');
  });

  it('returns empty string for invalid token', () => {
    const css = formatPropertyCSS('', {});
    expect(css).toBe('');
  });
});

// ============================================================================
// ServerStyleCollector
// ============================================================================

describe('ServerStyleCollector', () => {
  it('allocates sequential class names', () => {
    const collector = new ServerStyleCollector();

    const a = collector.allocateClassName('key-a');
    const b = collector.allocateClassName('key-b');

    expect(a).toEqual({ className: 't0', isNewAllocation: true });
    expect(b).toEqual({ className: 't1', isNewAllocation: true });
  });

  it('reuses class names for same cacheKey', () => {
    const collector = new ServerStyleCollector();

    const first = collector.allocateClassName('shared-key');
    const second = collector.allocateClassName('shared-key');

    expect(first.className).toBe('t0');
    expect(first.isNewAllocation).toBe(true);
    expect(second.className).toBe('t0');
    expect(second.isNewAllocation).toBe(false);
  });

  it('collects chunks and produces CSS', () => {
    const collector = new ServerStyleCollector();
    const { className } = collector.allocateClassName('ck1');

    collector.collectChunk('ck1', className, [
      {
        selector: '',
        declarations: 'display: flex',
        needsClassName: true,
      },
    ]);

    const css = collector.getCSS();
    expect(css).toContain('.t0.t0');
    expect(css).toContain('display: flex');
  });

  it('deduplicates chunks by cacheKey', () => {
    const collector = new ServerStyleCollector();
    const { className } = collector.allocateClassName('ck1');

    collector.collectChunk('ck1', className, [
      { selector: '', declarations: 'color: red', needsClassName: true },
    ]);
    collector.collectChunk('ck1', className, [
      { selector: '', declarations: 'color: blue', needsClassName: true },
    ]);

    const css = collector.getCSS();
    expect(css).toContain('color: red');
    expect(css).not.toContain('color: blue');
  });

  it('collects keyframes and properties', () => {
    const collector = new ServerStyleCollector();

    collector.collectKeyframes(
      'fadeIn',
      '@keyframes fadeIn { 0% { opacity: 0 } 100% { opacity: 1 } }',
    );
    collector.collectProperty(
      '$rotation',
      '@property --rotation { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
    );

    const css = collector.getCSS();
    expect(css).toContain('@keyframes fadeIn');
    expect(css).toContain('@property --rotation');
  });

  it('deduplicates keyframes and properties by name', () => {
    const collector = new ServerStyleCollector();

    collector.collectKeyframes('k1', 'first');
    collector.collectKeyframes('k1', 'second');

    const css = collector.getCSS();
    expect(css).toContain('first');
    expect(css).not.toContain('second');
  });

  it('flushCSS returns only new content', () => {
    const collector = new ServerStyleCollector();

    const { className: c0 } = collector.allocateClassName('ck0');
    collector.collectChunk('ck0', c0, [
      { selector: '', declarations: 'display: flex', needsClassName: true },
    ]);

    const flush1 = collector.flushCSS();
    expect(flush1).toContain('display: flex');

    const { className: c1 } = collector.allocateClassName('ck1');
    collector.collectChunk('ck1', c1, [
      { selector: '', declarations: 'color: red', needsClassName: true },
    ]);

    const flush2 = collector.flushCSS();
    expect(flush2).toContain('color: red');
    expect(flush2).not.toContain('display: flex');
  });

  it('collectInternals includes @property and :root token rules', () => {
    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    // INTERNAL_PROPERTIES: gap, radius, border-width, etc.
    expect(css).toContain('@property --gap');
    expect(css).toContain('@property --radius');
    expect(css).toContain('@property --border-width');
    // INTERNAL_TOKENS: font stacks, border-color
    expect(css).toContain(':root');
    expect(css).toContain('--font:');
    expect(css).toContain('--border-color:');
    // Color properties get companion -rgb rules
    expect(css).toContain('@property --white-color');
    expect(css).toContain('@property --white-color-rgb');
  });

  it('collectInternals is idempotent', () => {
    const collector = new ServerStyleCollector();
    collector.collectInternals();
    const css1 = collector.getCSS();
    collector.collectInternals();
    const css2 = collector.getCSS();
    expect(css1).toBe(css2);
  });

  it('getCacheState serializes entries and counter', () => {
    const collector = new ServerStyleCollector();

    collector.allocateClassName('key-a');
    collector.allocateClassName('key-b');

    const state = collector.getCacheState();
    expect(state.entries).toEqual({
      'key-a': 't0',
      'key-b': 't1',
    });
    expect(state.classCounter).toBe(2);
  });
});

// ============================================================================
// SSR collector with pipeline (end-to-end without React rendering)
// ============================================================================

describe('ServerStyleCollector with pipeline', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('produces valid CSS when fed pipeline output', async () => {
    const { renderStylesForChunk } = await import('../chunks');
    const { generateChunkCacheKey, categorizeStyleKeys } =
      await import('../chunks');

    const collector = new ServerStyleCollector();
    const styles = { display: 'flex', padding: '2x' } as any;

    const chunkMap = categorizeStyleKeys(styles);

    for (const [chunkName, styleKeys] of chunkMap) {
      if (styleKeys.length === 0) continue;

      const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
      const { className, isNewAllocation } =
        collector.allocateClassName(cacheKey);

      if (isNewAllocation) {
        const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
        if (renderResult.rules.length > 0) {
          collector.collectChunk(cacheKey, className, renderResult.rules);
        }
      }
    }

    const css = collector.getCSS();
    expect(css.length).toBeGreaterThan(0);
    expect(css).toContain('.t0.t0');
    expect(css).toMatch(/display:\s*flex/);

    const state = collector.getCacheState();
    expect(Object.keys(state.entries).length).toBeGreaterThan(0);
  });

  it('deduplicates chunks with same styles', async () => {
    const { renderStylesForChunk } = await import('../chunks');
    const { generateChunkCacheKey, categorizeStyleKeys } =
      await import('../chunks');

    const collector = new ServerStyleCollector();
    const styles = { display: 'flex' } as any;

    // Simulate two components with the same styles
    for (let i = 0; i < 2; i++) {
      const chunkMap = categorizeStyleKeys(styles);
      for (const [chunkName, styleKeys] of chunkMap) {
        if (styleKeys.length === 0) continue;
        const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
        const { className, isNewAllocation } =
          collector.allocateClassName(cacheKey);
        if (isNewAllocation) {
          const renderResult = renderStylesForChunk(
            styles,
            chunkName,
            styleKeys,
          );
          if (renderResult.rules.length > 0) {
            collector.collectChunk(cacheKey, className, renderResult.rules);
          }
        }
      }
    }

    const css = collector.getCSS();
    const matches = css.match(/\.t0\.t0/g);
    expect(matches).toHaveLength(1);
    expect(collector.getCacheState().classCounter).toBe(1);
  });
});

// ============================================================================
// hydrateTastyCache
// ============================================================================

describe('hydrateTastyCache', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    delete (window as any).__TASTY_SSR_CACHE__;
    document
      .querySelectorAll('script[data-tasty-cache]')
      .forEach((el) => el.remove());
  });

  it('pre-populates cache from explicit state', () => {
    hydrateTastyCache({
      entries: { 'APPEARANCE:fill=#purple': 't0' },
      classCounter: 1,
    });

    const result = allocateClassName('APPEARANCE:fill=#purple');
    expect(result.className).toBe('t0');
    expect(result.isNewAllocation).toBe(false);
  });

  it('reads from window.__TASTY_SSR_CACHE__', () => {
    (window as any).__TASTY_SSR_CACHE__ = {
      entries: { 'DIMENSION:padding=2x': 't5' },
      classCounter: 6,
    };

    hydrateTastyCache();

    const result = allocateClassName('DIMENSION:padding=2x');
    expect(result.className).toBe('t5');
    expect(result.isNewAllocation).toBe(false);
  });

  it('reads from <script data-tasty-cache>', () => {
    const script = document.createElement('script');
    script.setAttribute('data-tasty-cache', '');
    script.setAttribute('type', 'application/json');
    script.textContent = JSON.stringify({
      entries: { 'LAYOUT:flow=column': 't2' },
      classCounter: 3,
    });
    document.head.appendChild(script);

    hydrateTastyCache();

    const result = allocateClassName('LAYOUT:flow=column');
    expect(result.className).toBe('t2');
    expect(result.isNewAllocation).toBe(false);
  });

  it('inject() treats hydrated entries as already injected', () => {
    hydrateTastyCache({
      entries: { 'APPEARANCE:fill=#blue': 't0' },
      classCounter: 1,
    });

    const result = inject(
      [
        {
          selector: '',
          declarations: 'background: blue',
          needsClassName: true,
        },
      ],
      { cacheKey: 'APPEARANCE:fill=#blue' },
    );

    expect(result.className).toBe('t0');
    expect(typeof result.dispose).toBe('function');
  });

  it('trackRef increments refCount for hydrated entries', () => {
    hydrateTastyCache({
      entries: { 'DIMENSION:padding=2x': 't3' },
      classCounter: 4,
    });

    const result = trackRef('DIMENSION:padding=2x');
    expect(result).not.toBeNull();
    expect(result!.className).toBe('t3');
    expect(typeof result!.dispose).toBe('function');

    // Calling dispose should not throw
    result!.dispose();
  });

  it('trackRef returns null for unknown cacheKey', () => {
    const result = trackRef('NONEXISTENT:key');
    expect(result).toBeNull();
  });

  it('post-hydration: inject() reuses SSR className without re-inserting CSS', () => {
    hydrateTastyCache({
      entries: { 'APPEARANCE:fill=#purple': 't0' },
      classCounter: 1,
    });

    // allocateClassName finds the SSR entry
    const alloc = allocateClassName('APPEARANCE:fill=#purple');
    expect(alloc.className).toBe('t0');
    expect(alloc.isNewAllocation).toBe(false);

    // inject() with the same cacheKey hits the "already injected" path
    // (ruleIndex -2 is not a placeholder) — increments refCount, no CSS insertion
    const result = inject(
      [
        {
          selector: '',
          declarations: 'background: purple',
          needsClassName: true,
        },
      ],
      { cacheKey: 'APPEARANCE:fill=#purple' },
    );
    expect(result.className).toBe('t0');
    expect(typeof result.dispose).toBe('function');

    // New className allocations produce a fresh class
    const newAlloc = allocateClassName('NEW:chunk');
    expect(newAlloc.isNewAllocation).toBe(true);
    expect(newAlloc.className).toMatch(/^t\d+$/);
  });
});

// ============================================================================
// collectAutoInferredProperties (SSR auto-property inference)
// ============================================================================

describe('collectAutoInferredProperties', () => {
  it('infers <angle> from custom property values', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [
        { selector: '', declarations: '--angle: 0deg' },
        { selector: ':hover', declarations: '--angle: 30deg' },
      ],
      collector,
    );

    const css = collector.getCSS();
    expect(css).toContain('@property --angle');
    expect(css).toContain('"<angle>"');
    expect(css).toContain('initial-value: 0deg');
  });

  it('infers <length-percentage> from pixel values', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [{ selector: '', declarations: '--offset: 10px' }],
      collector,
    );

    const css = collector.getCSS();
    expect(css).toContain('@property --offset');
    expect(css).toContain('"<length-percentage>"');
    expect(css).toContain('initial-value: 0px');
  });

  it('infers <color> from --*-color name pattern', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [
        {
          selector: '',
          declarations: '--accent-color: oklch(0.5 0.15 272)',
        },
      ],
      collector,
    );

    const css = collector.getCSS();
    expect(css).toContain('@property --accent-color');
    expect(css).toContain('"<color>"');
  });

  it('skips explicitly declared properties', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [{ selector: '', declarations: '--angle: 45deg' }],
      collector,
      {
        '@properties': {
          $angle: { syntax: '<angle>', inherits: false, initialValue: '0deg' },
        },
      } as any,
    );

    const css = collector.getCSS();
    expect(css).not.toContain('@property --angle');
  });

  it('handles multiple properties in a single declaration block', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [
        {
          selector: '',
          declarations: '--x: 10px; --y: 20px; --rotation: 45deg',
        },
      ],
      collector,
    );

    const css = collector.getCSS();
    expect(css).toContain('@property --x');
    expect(css).toContain('@property --y');
    expect(css).toContain('@property --rotation');
  });

  it('deduplicates properties across multiple rules', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [
        { selector: '', declarations: '--angle: 0deg' },
        { selector: ':hover', declarations: '--angle: 30deg' },
        { selector: ':active', declarations: '--angle: 60deg' },
      ],
      collector,
    );

    const css = collector.getCSS();
    const matches = css.match(/@property --angle/g);
    expect(matches).toHaveLength(1);
  });

  it('skips rules without declarations', () => {
    const collector = new ServerStyleCollector();

    collectAutoInferredProperties(
      [{ selector: '', declarations: '' }],
      collector,
    );

    expect(collector.getCSS()).toBe('');
  });

  it('works end-to-end with rendered styles containing $angle', async () => {
    resetConfig();
    const { renderStylesForChunk, categorizeStyleKeys, generateChunkCacheKey } =
      await import('../chunks');

    const collector = new ServerStyleCollector();
    const styles = {
      $angle: {
        '': '0deg',
        ':hover': '30deg',
        ':active': '60deg',
      },
      transition: 'image, $$angle',
    } as any;

    const chunkMap = categorizeStyleKeys(styles);

    for (const [chunkName, styleKeys] of chunkMap) {
      if (styleKeys.length === 0) continue;
      const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
      const { isNewAllocation, className } =
        collector.allocateClassName(cacheKey);
      if (isNewAllocation) {
        const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
        if (renderResult.rules.length > 0) {
          collector.collectChunk(cacheKey, className, renderResult.rules);
          collectAutoInferredProperties(renderResult.rules, collector, styles);
        }
      }
    }

    const css = collector.getCSS();
    expect(css).toContain('@property --angle');
    expect(css).toContain('"<angle>"');
    expect(css).toContain('initial-value: 0deg');

    resetConfig();
  });
});
