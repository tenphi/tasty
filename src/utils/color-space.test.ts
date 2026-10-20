import { configure, resetConfig } from '../config';
import { createStyle } from '../styles/createStyle';

import { alphaToPercentage, mixColorAlpha, parseAlphaMix } from './color-space';

afterEach(() => {
  resetConfig();
});

describe('mixColorAlpha', () => {
  it('mixes the color against transparent in oklab', () => {
    expect(mixColorAlpha('var(--purple-color)', '50%')).toBe(
      'color-mix(in oklab, var(--purple-color) 50%, transparent)',
    );
  });

  it('takes any color, including ones with no decomposable channels', () => {
    // The browser resolves the color, so the engine never has to evaluate it.
    for (const color of [
      'color-mix(in oklab, red 50%, blue)',
      'light-dark(#fff, #000)',
      'color(display-p3 1 .5 0)',
      'var(--from-hand-authored-css)',
      'currentcolor',
      'red',
    ]) {
      expect(mixColorAlpha(color, '50%')).toBe(
        `color-mix(in oklab, ${color} 50%, transparent)`,
      );
    }
  });

  it('always mixes in oklab, whatever colorSpace says', () => {
    // oklab is unbounded, so a wide-gamut color is not clamped, and rectangular,
    // so there is no hue to interpolate against `transparent`.
    configure({ colorSpace: 'rgb' });

    expect(mixColorAlpha('oklch(0.7 0.35 30)', '50%')).toBe(
      'color-mix(in oklab, oklch(0.7 0.35 30) 50%, transparent)',
    );
  });
});

describe('parseAlphaMix', () => {
  it('splits a faded color into the color and the percentage', () => {
    expect(
      parseAlphaMix(
        'color-mix(in oklab, var(--purple-color) 50%, transparent)',
      ),
    ).toEqual({ color: 'var(--purple-color)', percentage: '50%' });
  });

  it('keeps a scaled custom property percentage whole', () => {
    expect(
      parseAlphaMix(
        'color-mix(in oklab, var(--a-color) calc(var(--fade) * 100%), transparent)',
      ),
    ).toEqual({
      color: 'var(--a-color)',
      percentage: 'calc(var(--fade) * 100%)',
    });
  });

  it('splits a doubly faded color on its outer layer', () => {
    expect(
      parseAlphaMix(
        'color-mix(in oklab, color-mix(in oklab, var(--a-color) 50%, transparent) 25%, transparent)',
      ),
    ).toEqual({
      color: 'color-mix(in oklab, var(--a-color) 50%, transparent)',
      percentage: '25%',
    });
  });

  it('handles a derived color as the origin', () => {
    expect(
      parseAlphaMix(
        'color-mix(in oklab, light-dark(var(--a-color),var(--b-color)) 50%, transparent)',
      ),
    ).toEqual({
      color: 'light-dark(var(--a-color),var(--b-color))',
      percentage: '50%',
    });
  });

  it('reads a fade the parser has normalized', () => {
    // Color functions lose the space after their commas on the way through.
    expect(
      parseAlphaMix('color-mix(in oklab,var(--purple-color) 40%,transparent)'),
    ).toEqual({ color: 'var(--purple-color)', percentage: '40%' });
  });

  it('returns null for anything else', () => {
    expect(parseAlphaMix('oklab(0.5 0.1 0.1)')).toBeNull();
    expect(parseAlphaMix('var(--a-color)')).toBeNull();
    // A mix of two colors is not a fade.
    expect(
      parseAlphaMix('color-mix(in oklab, var(--a-color) 50%, var(--b-color))'),
    ).toBeNull();
    expect(parseAlphaMix('oklch(from var(--a-color) l c h / .5)')).toBeNull();
  });
});

describe('alphaToPercentage', () => {
  it.each([
    [0.5, '50%'],
    [0.07, '7%'],
    [0.075, '7.5%'],
    [0, '0%'],
    [1, '100%'],
  ])('%s → %s', (alpha, expected) => {
    expect(alphaToPercentage(alpha)).toBe(expected);
  });
});

describe('the colorSpace option is inert', () => {
  // It used to rewrite a `#name` token's value into the configured space. The
  // value is now emitted as authored, whatever the option says. (The
  // deprecation warning itself goes through config's `warnOnce`, which is
  // suppressed under NODE_ENV=test, so the behavior is what gets asserted.)
  const handler = createStyle('#brand');

  it('leaves a hex literal alone in every space', () => {
    for (const colorSpace of ['rgb', 'hsl', 'oklch'] as const) {
      resetConfig();
      configure({ colorSpace });

      expect(handler({ '#brand': '#f80' })).toEqual({
        '--brand-color': '#f80',
      });
    }
  });

  it('leaves a native color function alone in every space', () => {
    for (const colorSpace of ['rgb', 'hsl', 'oklch'] as const) {
      resetConfig();
      configure({ colorSpace });

      expect(handler({ '#brand': 'hsl(120 100% 50%)' })).toEqual({
        '--brand-color': 'hsl(120 100% 50%)',
      });
    }
  });

  it('leaves a bare CSS color name alone in every space', () => {
    for (const colorSpace of ['rgb', 'hsl', 'oklch'] as const) {
      resetConfig();
      configure({ colorSpace });

      expect(handler({ '#brand': 'red' })).toEqual({ '--brand-color': 'red' });
    }
  });
});
