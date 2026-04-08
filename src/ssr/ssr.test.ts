import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configure, resetConfig } from '../config';
import { inject, injector } from '../injector';

import { collectAutoInferredProperties } from './collect-auto-properties';
import { ServerStyleCollector } from './collector';
import { formatRules } from './format-rules';
import { formatKeyframesCSS } from './format-keyframes';
import { formatPropertyCSS } from './format-property';
import { hashString } from '../utils/hash';
import { hydrateTastyClasses } from './hydrate';

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

  it('formats a color property with companion component property', () => {
    const css = formatPropertyCSS('#accent', {
      initialValue: 'rgb(128 0 255)',
    });
    expect(css).toContain('@property --accent-color');
    expect(css).toContain('syntax: "<color>"');
    expect(css).toContain('@property --accent-color-oklch');
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
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('allocates deterministic hash-based class names', () => {
    const collector = new ServerStyleCollector();

    const a = collector.allocateClassName('key-a');
    const b = collector.allocateClassName('key-b');

    expect(a.className).toBe(`t${hashString('key-a')}`);
    expect(a.isNewAllocation).toBe(true);
    expect(b.className).toBe(`t${hashString('key-b')}`);
    expect(b.isNewAllocation).toBe(true);
    expect(a.className).not.toBe(b.className);
  });

  it('reuses class names for same cacheKey', () => {
    const collector = new ServerStyleCollector();

    const first = collector.allocateClassName('shared-key');
    const second = collector.allocateClassName('shared-key');

    expect(first.className).toBe(`t${hashString('shared-key')}`);
    expect(first.isNewAllocation).toBe(true);
    expect(second.className).toBe(first.className);
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
    expect(css).toContain(`.${className}.${className}`);
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

  it('collectInternals includes @property rules', () => {
    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    // DEFAULT_PROPERTIES: gap, radius, border-width, font fallbacks, etc.
    expect(css).toContain('@property --gap');
    expect(css).toContain('@property --radius');
    expect(css).toContain('@property --border-width');
    expect(css).toContain('@property --font-sans-fallback');
    expect(css).toContain('@property --font-mono-fallback');
    // Color properties get companion -rgb rules
    expect(css).toContain('@property --white-color');
    expect(css).toContain('@property --white-color-oklch');
  });

  it('collectInternals is idempotent', () => {
    const collector = new ServerStyleCollector();
    collector.collectInternals();
    const css1 = collector.getCSS();
    collector.collectInternals();
    const css2 = collector.getCSS();
    expect(css1).toBe(css2);
  });

  it('getRenderedClassNames returns flushed class names', () => {
    const collector = new ServerStyleCollector();

    collector.allocateClassName('key-a');
    collector.allocateClassName('key-b');

    const names = collector.getRenderedClassNames();
    expect(names).toEqual([
      `t${hashString('key-a')}`,
      `t${hashString('key-b')}`,
    ]);

    // Second call returns only new names
    collector.allocateClassName('key-c');
    const names2 = collector.getRenderedClassNames();
    expect(names2).toEqual([`t${hashString('key-c')}`]);
  });

  it('collectInternals includes configured tokens as :root CSS custom properties', () => {
    configure({
      tokens: {
        '$my-gap': '8px',
        '#primary': 'purple',
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    expect(css).toContain('--my-gap');
    expect(css).toContain('8px');
    expect(css).toContain('--primary-color');
  });

  it('flushCSS includes configured tokens on first flush', () => {
    configure({
      tokens: {
        '$my-gap': '8px',
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const flush1 = collector.flushCSS();
    expect(flush1).toContain('--my-gap');
    expect(flush1).toContain('8px');

    // Second flush should not repeat tokens
    const flush2 = collector.flushCSS();
    expect(flush2).not.toContain('--my-gap');
  });

  it('collectInternals includes configured globalStyles', () => {
    configure({
      globalStyles: {
        body: {
          color: 'red',
          padding: '0',
        },
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    expect(css).toContain('body');
    expect(css).toContain('color');
    expect(css).toContain('red');
    expect(css).toContain('padding');
  });

  it('collectInternals includes presets as :root tokens', () => {
    configure({
      presets: {
        h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    expect(css).toContain(':root');
    expect(css).toContain('--h1-font-size');
    expect(css).toContain('32px');
  });
});

// ============================================================================
// SSR internals emission
// ============================================================================

describe('SSR internals emission', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('collectInternals emits tokens and @property', () => {
    configure({
      tokens: { $gap: '8px' },
      presets: {
        h1: { fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    expect(css).toContain('@property --gap');
    expect(css).toContain(':root');
    expect(css).toContain('--gap: 8px');
    expect(css).toContain('--h1-font-size');
  });

  it('collectInternals emits both tokens and globalStyles', () => {
    configure({
      tokens: { $gap: '8px' },
      globalStyles: {
        body: { color: 'red', padding: '0' },
      },
    });

    const collector = new ServerStyleCollector();
    collector.collectInternals();

    const css = collector.getCSS();
    expect(css).toContain('--gap: 8px');
    expect(css).toContain('body');
    expect(css).toContain('red');
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
    const classNames: string[] = [];

    for (const [chunkName, styleKeys] of chunkMap) {
      if (styleKeys.length === 0) continue;

      const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
      const { className, isNewAllocation } =
        collector.allocateClassName(cacheKey);

      classNames.push(className);

      if (isNewAllocation) {
        const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
        if (renderResult.rules.length > 0) {
          collector.collectChunk(cacheKey, className, renderResult.rules);
        }
      }
    }

    const css = collector.getCSS();
    expect(css.length).toBeGreaterThan(0);
    expect(classNames.length).toBeGreaterThan(0);
    expect(css).toContain(`.${classNames[0]}.${classNames[0]}`);
    expect(css).toMatch(/display:\s*flex/);

    const renderedNames = collector.getRenderedClassNames();
    expect(renderedNames.length).toBeGreaterThan(0);
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
    const renderedNames = collector.getRenderedClassNames();
    expect(renderedNames).toHaveLength(1);
    const cls = renderedNames[0];
    const re = new RegExp(`\\.${cls}\\.${cls}`, 'g');
    const matches = css.match(re);
    expect(matches).toHaveLength(1);
  });
});

// ============================================================================
// hydrateTastyClasses
// ============================================================================

describe('hydrateTastyClasses', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
    delete (window as any).__TASTY__;
  });

  it('pre-populates rules from explicit class list', () => {
    const className = `t${hashString('APPEARANCE:fill=#purple')}`;
    hydrateTastyClasses([className]);

    const registry = injector.instance._sheetManager.getRegistry(document);
    expect(registry.rules.has(className)).toBe(true);
    expect(registry.rules.get(className)!.ruleIndex).toBe(-2);
  });

  it('reads from window.__TASTY__', () => {
    const className = `t${hashString('DIMENSION:padding=2x')}`;
    (window as any).__TASTY__ = [className];

    hydrateTastyClasses();

    const registry = injector.instance._sheetManager.getRegistry(document);
    expect(registry.rules.has(className)).toBe(true);
  });

  it('inject() treats hydrated entries as already injected', () => {
    const cacheKey = 'APPEARANCE:fill=#blue';
    const expectedClassName = `t${hashString(cacheKey)}`;

    hydrateTastyClasses([expectedClassName]);

    const result = inject(
      [
        {
          selector: '',
          declarations: 'background: blue',
          needsClassName: true,
        },
      ],
      { cacheKey },
    );

    expect(result.className).toBe(expectedClassName);
    expect(typeof result.dispose).toBe('function');
  });

  it('trackRef returns null for unknown cacheKey', () => {
    const result = injector.instance.trackRef('NONEXISTENT:key');
    expect(result).toBeNull();
  });

  it('post-hydration: inject() reuses SSR className without re-inserting CSS', () => {
    const cacheKey = 'APPEARANCE:fill=#purple';
    const expectedClassName = `t${hashString(cacheKey)}`;

    hydrateTastyClasses([expectedClassName]);

    // allocateClassName finds the SSR entry via hash match
    const alloc = injector.instance.allocateClassName(cacheKey);
    expect(alloc.className).toBe(expectedClassName);
    expect(alloc.isNewAllocation).toBe(false);

    // inject() with the same cacheKey hits the "already injected" path
    const result = inject(
      [
        {
          selector: '',
          declarations: 'background: purple',
          needsClassName: true,
        },
      ],
      { cacheKey },
    );
    expect(result.className).toBe(expectedClassName);
    expect(typeof result.dispose).toBe('function');

    // New className allocations produce a hash-based class
    const newAlloc = injector.instance.allocateClassName('NEW:chunk');
    expect(newAlloc.isNewAllocation).toBe(true);
    expect(newAlloc.className).toMatch(/^t[a-z0-9]+$/);
  });

  it('RSC and client produce the same class name for the same cache key', () => {
    const cacheKey = 'appearance\0fill:"#purple"';

    // Allocate on the server side
    const collector = new ServerStyleCollector();
    const serverAlloc = collector.allocateClassName(cacheKey);

    // Simulate hydration with the server's class list
    hydrateTastyClasses([serverAlloc.className]);

    // Client allocates for the same cache key — should match
    const clientAlloc = injector.instance.allocateClassName(cacheKey);
    expect(clientAlloc.className).toBe(serverAlloc.className);
    expect(clientAlloc.isNewAllocation).toBe(false);

    // inject() also reuses the hydrated class
    const result = inject(
      [
        {
          selector: '',
          declarations: 'background: purple',
          needsClassName: true,
        },
      ],
      { cacheKey },
    );

    expect(result.className).toBe(serverAlloc.className);
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
