import { configureZero, resetZeroConfig } from './config';
import { extractStylesWithChunks } from './extractor';
import { configure, extractStylesForSelector, resetConfig } from './index';

describe('zero configure()', () => {
  afterEach(() => resetConfig());

  it.each(['#clear', '#clear.5', '#clear.$opacity'])(
    'extracts %s as transparent without configuration',
    (color) => {
      const { css } = extractStylesForSelector('.card', { fill: color });
      expect(css).toBe('.card { background-color: transparent; }');
    },
  );

  it('restores the clear alias after resetting an explicit override', () => {
    configure({ replaceTokens: { '#clear': 'rgb(255 0 0)' } });
    expect(extractStylesForSelector('.card', { fill: '#clear.5' }).css).toBe(
      '.card { background-color: rgb(255 0 0 / .5); }',
    );

    resetConfig();
    expect(extractStylesForSelector('.card', { fill: '#clear.5' }).css).toBe(
      '.card { background-color: transparent; }',
    );
  });

  it.each([true, 'transparent', '#clear'])(
    'keeps a configured alias for %s transparent with opacity',
    (value) => {
      configure({ replaceTokens: { '#invisible': value } });

      const { css } = extractStylesForSelector('.card', {
        fill: '#invisible.$opacity',
      });
      expect(css).toBe('.card { background-color: transparent; }');
    },
  );

  it('applies units, states and replace tokens to extraction', () => {
    configure({
      units: { u: 'var(--unit)' },
      states: { '@narrow': '@media(w < 600px)' },
      replaceTokens: { $gutter: '3u' },
    });

    const { css } = extractStylesForSelector('.card', {
      padding: { '': '$gutter', '@narrow': '2u' },
    });

    expect(css).toContain('padding: calc(3 * var(--unit));');
    expect(css).toContain('@media (width < 600px)');
    expect(css).toContain('padding: calc(2 * var(--unit));');
  });

  it('resolves configured recipes', () => {
    configure({ recipes: { card: { radius: '1r', fill: '#white' } } });

    const { css } = extractStylesForSelector('.card', { recipe: 'card' });
    expect(css).toContain('background-color: var(--white-color);');

    const chunks = extractStylesWithChunks({ recipe: 'card' });
    expect(chunks.map((chunk) => chunk.css).join('\n')).toContain(
      'background-color: var(--white-color);',
    );
  });

  it('emits configured keyframes that selector styles animate', () => {
    configure({ keyframes: { fade: { from: { opacity: 0 } } } });

    const { css } = extractStylesForSelector('.toast', {
      animation: 'fade 1s',
    });

    const name = /@keyframes (\S+)/.exec(css)?.[1];
    expect(name).toMatch(/^tsk[a-f0-9]{6}$/);
    expect(css).toContain(`.toast { animation: ${name} 1s; }`);
  });

  it('runs keyframe steps through the style handlers', () => {
    configure({
      units: { u: '4px' },
      keyframes: {
        slide: { from: { transform: 'translateX(2u)', fill: '#red' } },
      },
    });

    const { css } = extractStylesForSelector('.toast', {
      animation: 'slide 1s',
    });

    expect(css).toMatch(
      /@keyframes tsk[a-f0-9]{6} \{ from \{ background-color: var\(--red-color\); transform: translateX\(8px\) \} \}/,
    );
  });

  it('uses the configured name prefix', () => {
    configure({ namePrefix: 'build' });

    expect(extractStylesWithChunks({ display: 'block' })[0].className).toMatch(
      /^build[a-f0-9]{6}$/,
    );
  });

  it('replaces the previous configuration', () => {
    configure({
      units: { u: 'var(--unit)' },
      states: { '@narrow': '@media(w < 600px)' },
    });
    configure({ namePrefix: 'next' });

    const { css } = extractStylesForSelector('.card', {
      padding: { '': '2u', '@narrow': '1x' },
    });

    expect(css).not.toContain('var(--unit)');
    expect(css).not.toContain('@media');
    expect(extractStylesWithChunks({ display: 'block' })[0].className).toMatch(
      /^next[a-f0-9]{6}$/,
    );
  });

  it('keeps the previous configuration when the prefix is rejected', () => {
    configure({ namePrefix: 'build', units: { u: '4px' } });

    expect(() => configure({ namePrefix: 'Bad Prefix!' })).toThrow(
      /namePrefix/,
    );
    expect(extractStylesForSelector('.a', { padding: '1u' }).css).toBe(
      '.a { padding: 4px; }',
    );
    expect(extractStylesWithChunks({ display: 'block' })[0].className).toMatch(
      /^build[a-f0-9]{6}$/,
    );
  });

  it('re-applies itself after another configuration replaced it', () => {
    configure({ namePrefix: 'build', units: { u: '4px' } });

    // What the Babel plugin or withTastyNext() do with their own config.
    resetZeroConfig();
    configureZero({ units: { u: '100px' } });

    expect(extractStylesForSelector('.a', { padding: '1u' }).css).toBe(
      '.a { padding: 4px; }',
    );
    expect(extractStylesWithChunks({ display: 'block' })[0].className).toMatch(
      /^build[a-f0-9]{6}$/,
    );
  });

  it('resetConfig() restores the defaults', () => {
    configure({
      namePrefix: 'build',
      units: { u: 'var(--unit)' },
      recipes: { card: { fill: '#white' } },
    });
    resetConfig();

    expect(extractStylesWithChunks({ display: 'block' })[0].className).toMatch(
      /^ts[a-f0-9]{6}$/,
    );
    expect(
      extractStylesForSelector('.card', { padding: '2u' }).css,
    ).not.toContain('var(--unit)');
  });
});
