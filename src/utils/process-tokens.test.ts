import { configure, resetConfig } from '../config';

import { processTokens } from './process-tokens';

describe('processTokens', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  describe('color token values', () => {
    // `processTokens` emits the parsed value as-is — the color space conversion
    // that `#name` style keys go through does not apply to the `tokens` prop.
    it('keeps a native color function verbatim', () => {
      const result = processTokens({
        '#primary': 'hsl(200 40% 50%)',
      });

      expect(result).toBeDefined();
      expect(result!['--primary-color']).toBe('hsl(200 40% 50%)');
    });

    it('keeps an alpha channel', () => {
      const result = processTokens({
        '#accent': 'hsla(200 40% 50% / 0.5)',
      });

      expect(result!['--accent-color']).toBe('hsla(200 40% 50% / 0.5)');
    });

    it('resolves a hex literal through its token name', () => {
      const result = processTokens({
        '#primary': '#ff8040',
      });

      expect(result!['--primary-color']).toBe('var(--ff8040-color, #ff8040)');
    });

    it('resolves okhsl() to rgb() at parse time', () => {
      const result = processTokens({
        '#purple': 'okhsl(280.3 80% 52%)',
      });

      expect(result!['--purple-color']).toMatch(/^rgb\(/);
      expect(result!['--purple-color']).not.toContain('okhsl');
    });

    it('keeps the alpha when resolving okhsl()', () => {
      const result = processTokens({
        '#custom': 'okhsl(280.3 80% 52% / 0.5)',
      });

      expect(result!['--custom-color']).toMatch(/^rgb\(.+ \/ /);
      expect(result!['--custom-color']).not.toContain('okhsl');
    });
  });

  describe('custom property tokens', () => {
    it('processes $ tokens correctly', () => {
      const result = processTokens({
        $gap: '16px',
      });

      expect(result).toBeDefined();
      expect(result!['--gap']).toBe('16px');
    });

    it('converts boolean true to an empty value', () => {
      expect(processTokens({ $flag: true })).toEqual({ '--flag': '' });
    });

    it('keeps a numeric 0 as `0` rather than giving it a unit', () => {
      expect(processTokens({ $gap: 0 })).toEqual({ '--gap': '0' });
    });
  });

  describe('one property per token key', () => {
    it('declares exactly one property for each key', () => {
      const result = processTokens({
        $gap: '2x',
        '#brand': '#purple',
        '#surface': 'hsl(200 40% 50%)',
        '#mix': 'color-mix(in oklab, #purple 50%, #red)',
      });

      expect(Object.keys(result!).sort()).toEqual([
        '--brand-color',
        '--gap',
        '--mix-color',
        '--surface-color',
      ]);
    });

    it('ignores a key with no recognized sigil', () => {
      expect(processTokens({ gap: '2x' } as never)).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined for empty tokens', () => {
      expect(processTokens({})).toBeUndefined();
    });

    it('returns undefined for undefined tokens', () => {
      expect(processTokens(undefined)).toBeUndefined();
    });

    it('skips null and undefined values', () => {
      const result = processTokens({
        '#valid': 'hsl(200 50% 50%)',
        '#invalid': undefined as any,
      });

      expect(result).toBeDefined();
      expect(result!['--valid-color']).toBeDefined();
      expect(result!['--invalid-color']).toBeUndefined();
    });
  });

  describe('native color functions with var() tokens', () => {
    // Regression: oklch(... var(...) ...) was round-tripped through sRGB,
    // NaN'ing the var() hue. Same-space native functions must preserve
    // var()/calc() tokens verbatim. See color-space.ts same-space fast path.
    it('preserves var() in an oklch() token with a $hue replaceToken', () => {
      configure({ replaceTokens: { $hue: 'var(--hue)' } });

      const result = processTokens({
        '#accent': 'oklch($hue .2 20)',
      }) as Record<string, string>;

      expect(result['--accent-color']).toBe('oklch(var(--hue) .2 20)');
      expect(result['--accent-color']).not.toContain('nan');
    });

    it('preserves var() alpha in oklch() token', () => {
      const result = processTokens({
        '#accent': 'oklch(var(--hue) .2 20 / var(--a))',
      }) as Record<string, string>;

      expect(result['--accent-color']).toBe(
        'oklch(var(--hue) .2 20 / var(--a))',
      );
    });

    it('preserves var() channels in an rgb() token', () => {
      const result = processTokens({
        '#accent': 'rgb(var(--r) var(--g) var(--b))',
      }) as Record<string, string>;

      expect(result['--accent-color']).toBe('rgb(var(--r) var(--g) var(--b))');
    });
  });

  describe('derived color functions', () => {
    // A color the engine cannot evaluate at build time is emitted as authored;
    // `#name.alpha` fades it by reference, so nothing has to be decomposed.
    it('expands the tokens inside a color-mix()', () => {
      const result = processTokens({
        '#brand': 'color-mix(in oklab, #purple 50%, #red)',
      });

      expect(result!['--brand-color']).toBe(
        'color-mix(in oklab,var(--purple-color) 50%,var(--red-color))',
      );
    });

    it('expands the tokens inside a light-dark()', () => {
      const result = processTokens({
        '#surface': 'light-dark(#light, #dark)',
      });

      expect(result!['--surface-color']).toBe(
        'light-dark(var(--light-color),var(--dark-color))',
      );
    });

    it('keeps a color() in a space it cannot convert', () => {
      const result = processTokens({
        '#wide': 'color(display-p3 1 0.5 0)',
      });

      expect(result!['--wide-color']).toBe('color(display-p3 1 0.5 0)');
    });

    it('keeps the whole fallback chain', () => {
      const result = processTokens({
        '#brand': '(#primary, #fallback)',
      });

      expect(result!['--brand-color']).toBe(
        'var(--primary-color, var(--fallback-color))',
      );
    });
  });

  describe('boolean color token values', () => {
    it('converts boolean true to transparent for color tokens', () => {
      const result = processTokens({
        '#overlay': true,
      });

      expect(result).toBeDefined();
      // Boolean true converts to 'transparent' which the parser keeps as-is
      expect(result!['--overlay-color']).toBe('transparent');
    });

    it('skips color tokens with boolean false', () => {
      const result = processTokens({
        '#hidden': false,
        '#visible': '#purple',
      });

      expect(result).toBeDefined();
      expect(result!['--hidden-color']).toBeUndefined();
      expect(result!['--visible-color']).toBeDefined();
    });

    it('handles mixed boolean and string color tokens', () => {
      const result = processTokens({
        '#background': true,
        '#foreground': '#dark',
      });

      expect(result).toBeDefined();
      expect(result!['--background-color']).toBe('transparent');
      expect(result!['--foreground-color']).toBe('var(--dark-color)');
    });
  });

  describe('#current color token', () => {
    it('processes #current to currentcolor', () => {
      const result = processTokens({
        '#my-color': '#current',
      });

      expect(result).toBeDefined();
      expect(result!['--my-color-color']).toBe('currentcolor');
    });

    it('composes #current.5 with color-mix', () => {
      const result = processTokens({
        '#my-color': '#current.5',
      });

      expect(result!['--my-color-color']).toBe(
        'color-mix(in oklab, currentcolor 50%, transparent)',
      );
    });

    it('composes #current.$opacity with color-mix', () => {
      const result = processTokens({
        '#my-color': '#current.$fade',
      });

      expect(result!['--my-color-color']).toBe(
        'color-mix(in oklab, currentcolor calc(var(--fade) * 100%), transparent)',
      );
    });

    it('does not match #current-theme or similar token names', () => {
      // Tokens like #current-theme should NOT be treated as #current
      const result = processTokens({
        '#accent': '#current-theme',
      });

      expect(result!['--accent-color']).toBe('var(--current-theme-color)');
    });

    it('does not match #currently-used or similar token names', () => {
      const result = processTokens({
        '#my-color': '#currently-used',
      });

      expect(result!['--my-color-color']).toBe('var(--currently-used-color)');
    });
  });
});
