import { configure, resetConfig } from '../config';
import { createStyle } from '../styles/createStyle';

import {
  mixColorAlpha,
  overrideColorAlpha,
  parseAlphaOverride,
} from './color-space';

afterEach(() => {
  resetConfig();
});

describe('overrideColorAlpha — replaces the alpha', () => {
  it('writes the alpha slot with relative color syntax', () => {
    expect(overrideColorAlpha('var(--purple-color)', '.5')).toBe(
      'oklch(from var(--purple-color) l c h / .5)',
    );
  });

  it('passes a percentage alpha through as authored', () => {
    expect(overrideColorAlpha('var(--purple-color)', '50%')).toBe(
      'oklch(from var(--purple-color) l c h / 50%)',
    );
  });

  it('passes a var() alpha through as authored', () => {
    expect(overrideColorAlpha('var(--purple-color)', 'var(--fade)')).toBe(
      'oklch(from var(--purple-color) l c h / var(--fade))',
    );
  });

  it('takes any color as the origin, including ones with no decomposable channels', () => {
    // The point of relative color syntax: the browser resolves the channels, so
    // the engine never has to evaluate the color.
    for (const color of [
      'color-mix(in oklab, red 50%, blue)',
      'light-dark(#fff, #000)',
      'color(display-p3 1 .5 0)',
      'var(--from-hand-authored-css)',
      'red',
    ]) {
      expect(overrideColorAlpha(color, '.5')).toBe(
        `oklch(from ${color} l c h / .5)`,
      );
    }
  });

  it('always uses oklch, which is unbounded', () => {
    // A gamut-limited space would clamp a wide-gamut origin. Nothing configures
    // this — `colorSpace` has no say in it.
    configure({ colorSpace: 'rgb' });

    expect(overrideColorAlpha('oklch(0.7 0.35 30)', '.5')).toBe(
      'oklch(from oklch(0.7 0.35 30) l c h / .5)',
    );
  });
});

describe('mixColorAlpha — composes the alpha', () => {
  it('mixes against transparent so an inherited alpha multiplies', () => {
    expect(mixColorAlpha('currentcolor', '40%')).toBe(
      'color-mix(in oklab, currentcolor 40%, transparent)',
    );
  });

  it('is distinct from overrideColorAlpha, which replaces', () => {
    // `#current.N` composes and `#token.N` replaces; unifying them would double
    // the opacity of every nested step in a `currentcolor` ramp.
    expect(mixColorAlpha('currentcolor', '50%')).not.toBe(
      overrideColorAlpha('currentcolor', '.5'),
    );
  });
});

describe('parseAlphaOverride', () => {
  it('splits a faded color into the color and the alpha', () => {
    expect(
      parseAlphaOverride('oklch(from var(--purple-color) l c h / .5)'),
    ).toEqual({ color: 'var(--purple-color)', alpha: '.5' });
  });

  it('keeps a var() alpha whole', () => {
    expect(
      parseAlphaOverride('oklch(from var(--a-color) l c h / var(--fade))'),
    ).toEqual({ color: 'var(--a-color)', alpha: 'var(--fade)' });
  });

  it('splits a doubly faded color on its outer layer', () => {
    expect(
      parseAlphaOverride(
        'oklch(from oklch(from var(--a-color) l c h / .5) l c h / .25)',
      ),
    ).toEqual({
      color: 'oklch(from var(--a-color) l c h / .5)',
      alpha: '.25',
    });
  });

  it('handles a derived color as the origin', () => {
    expect(
      parseAlphaOverride(
        'oklch(from light-dark(var(--a-color),var(--b-color)) l c h / .5)',
      ),
    ).toEqual({
      color: 'light-dark(var(--a-color),var(--b-color))',
      alpha: '.5',
    });
  });

  it('returns null for anything else', () => {
    expect(parseAlphaOverride('oklab(0.5 0.1 0.1)')).toBeNull();
    expect(parseAlphaOverride('var(--a-color)')).toBeNull();
    expect(
      parseAlphaOverride(
        'color-mix(in oklab, var(--a-color) 50%, transparent)',
      ),
    ).toBeNull();
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
