import { configure, resetConfig } from '../config';

import {
  getColorSpace,
  parseAlphaOverride,
  resetColorSpace,
  setColorSpace,
  strToColorSpace,
} from './color-space';

afterEach(() => {
  resetColorSpace();
  resetConfig();
});

describe('strToColorSpace — alpha preservation', () => {
  describe('colorSpace = rgb', () => {
    beforeEach(() => setColorSpace('rgb'));

    it('preserves full opacity (no alpha suffix)', () => {
      expect(strToColorSpace('rgb(255, 128, 0)')).toBe('rgb(255 128 0)');
    });

    it('preserves alpha from rgba()', () => {
      expect(strToColorSpace('rgba(0, 0, 0, 0)')).toBe('rgb(0 0 0 / 0)');
    });

    it('preserves alpha from rgb() with slash notation', () => {
      expect(strToColorSpace('rgb(0 0 0 / 0)')).toBe('rgb(0 0 0 / 0)');
    });

    it('preserves fractional alpha', () => {
      expect(strToColorSpace('rgba(255, 0, 0, 0.5)')).toBe(
        'rgb(255 0 0 / 0.5)',
      );
    });

    it('preserves alpha from 8-char hex', () => {
      expect(strToColorSpace('#00000000')).toBe('rgb(0 0 0 / 0)');
    });

    it('preserves alpha from 4-char hex', () => {
      expect(strToColorSpace('#0000')).toBe('rgb(0 0 0 / 0)');
    });

    it('treats 6-char hex as opaque', () => {
      expect(strToColorSpace('#000000')).toBe('rgb(0 0 0)');
    });

    it('treats 3-char hex as opaque', () => {
      expect(strToColorSpace('#000')).toBe('rgb(0 0 0)');
    });

    it('preserves alpha from hsl() with slash', () => {
      expect(strToColorSpace('hsl(0 0% 0% / 0.5)')).toBe('rgb(0 0 0 / 0.5)');
    });

    it('preserves alpha from hsla()', () => {
      expect(strToColorSpace('hsla(0, 0%, 0%, 0)')).toBe('rgb(0 0 0 / 0)');
    });

    it('preserves alpha from oklch() with slash', () => {
      expect(strToColorSpace('oklch(0 0 0 / 0.5)')).toBe('rgb(0 0 0 / 0.5)');
    });
  });

  describe('colorSpace = oklch', () => {
    beforeEach(() => setColorSpace('oklch'));

    it('preserves full opacity (no alpha suffix)', () => {
      const result = strToColorSpace('#ff0000');
      expect(result).toMatch(/^oklch\(/);
      expect(result).not.toContain('/');
    });

    it('preserves alpha from rgba(0,0,0,0)', () => {
      expect(strToColorSpace('rgba(0, 0, 0, 0)')).toMatch(/^oklch\(.+ \/ 0\)$/);
    });

    it('preserves alpha from 8-char hex', () => {
      const result = strToColorSpace('#ff000080');
      expect(result).toMatch(/^oklch\(.+ \/ .+\)$/);
    });
  });

  describe('colorSpace = hsl', () => {
    beforeEach(() => setColorSpace('hsl'));

    it('preserves full opacity (no alpha suffix)', () => {
      expect(strToColorSpace('#000000')).toBe('hsl(0 0% 0%)');
    });

    it('preserves alpha from rgba(0,0,0,0)', () => {
      expect(strToColorSpace('rgba(0, 0, 0, 0)')).toBe('hsl(0 0% 0% / 0)');
    });
  });
});

describe('same-space fast path — preserves same-space values verbatim', () => {
  describe('colorSpace = oklch', () => {
    beforeEach(() => setColorSpace('oklch'));

    it('preserves var() hue in oklch()', () => {
      expect(strToColorSpace('oklch(var(--hue) .2 20)')).toBe(
        'oklch(var(--hue) .2 20)',
      );
    });

    it('preserves mixed-case var() names (custom properties are case-sensitive)', () => {
      expect(strToColorSpace('oklch(var(--myHue) .2 20)')).toBe(
        'oklch(var(--myHue) .2 20)',
      );
    });

    it('preserves slash alpha with var()', () => {
      expect(strToColorSpace('oklch(var(--hue) .2 20 / var(--a))')).toBe(
        'oklch(var(--hue) .2 20 / var(--a))',
      );
    });

    it('preserves calc() tokens', () => {
      expect(strToColorSpace('oklch(calc(var(--l) + 0.1) .2 20)')).toBe(
        'oklch(calc(var(--l) + 0.1) .2 20)',
      );
    });

    it('preserves purely numeric oklch verbatim (no sRGB round-trip / gamut clamp)', () => {
      // Static same-space values are kept as-is: no work, no sRGB gamut clamp.
      expect(strToColorSpace('oklch(0.5 0.2 20)')).toBe('oklch(0.5 0.2 20)');
    });

    it('preserves wide-gamut oklch chroma that sRGB would clamp', () => {
      expect(strToColorSpace('oklch(0.7 0.35 30)')).toBe('oklch(0.7 0.35 30)');
    });

    it('normalizes function name/whitespace but keeps values', () => {
      expect(strToColorSpace('oklch(0.5   0.2   20)')).toBe(
        'oklch(0.5 0.2 20)',
      );
    });

    it('normalizes a percentage lightness to the canonical 0-1 number', () => {
      expect(strToColorSpace('oklch(70% 0.2 20)')).toBe('oklch(70% 0.2 20)');
    });
  });

  describe('colorSpace = rgb', () => {
    beforeEach(() => setColorSpace('rgb'));

    it('preserves var() channels in rgb()', () => {
      expect(strToColorSpace('rgb(var(--r) var(--g) var(--b))')).toBe(
        'rgb(var(--r) var(--g) var(--b))',
      );
    });

    it('normalizes legacy rgba commas to modern syntax', () => {
      expect(strToColorSpace('rgba(0, 0, 0, 0)')).toBe('rgb(0 0 0 / 0)');
    });

    it('preserves var() alpha via slash notation', () => {
      expect(
        strToColorSpace('rgb(var(--r) var(--g) var(--b) / var(--a))'),
      ).toBe('rgb(var(--r) var(--g) var(--b) / var(--a))');
    });

    it('preserves static rgb value verbatim (no round-trip)', () => {
      expect(strToColorSpace('rgb(255 128 0)')).toBe('rgb(255 128 0)');
    });

    it('keeps static rgb percentage channels verbatim', () => {
      // Mirrors okhsl()/okhst() -> rgb(...%) parser output.
      expect(strToColorSpace('rgb(100% 100% 100%)')).toBe(
        'rgb(100% 100% 100%)',
      );
    });
  });

  describe('colorSpace = hsl', () => {
    beforeEach(() => setColorSpace('hsl'));

    it('preserves var() hue in hsl()', () => {
      expect(strToColorSpace('hsl(var(--h) 50% 50%)')).toBe(
        'hsl(var(--h) 50% 50%)',
      );
    });

    it('preserves slash alpha with var()', () => {
      expect(strToColorSpace('hsl(var(--h) 50% 50% / var(--a))')).toBe(
        'hsl(var(--h) 50% 50% / var(--a))',
      );
    });
  });

  describe('cross-space still round-trips through sRGB', () => {
    beforeEach(() => setColorSpace('rgb'));

    it('converts oklch numeric input to rgb (fallback path)', () => {
      expect(strToColorSpace('oklch(0 0 0 / 0.5)')).toBe('rgb(0 0 0 / 0.5)');
    });
  });
});

describe('configure() colorSpace merge semantics', () => {
  it('does not reset colorSpace when a subsequent configure() omits it', () => {
    configure({ colorSpace: 'rgb' });
    expect(getColorSpace()).toBe('rgb');

    configure({ states: { '@mobile': '@media(w < 920px)' } });
    expect(getColorSpace()).toBe('rgb');
  });

  it('overrides colorSpace when explicitly provided in a subsequent call', () => {
    configure({ colorSpace: 'rgb' });
    expect(getColorSpace()).toBe('rgb');

    configure({ colorSpace: 'hsl' });
    expect(getColorSpace()).toBe('hsl');
  });

  it('defaults to oklch when no configure() call sets colorSpace', () => {
    configure({});
    expect(getColorSpace()).toBe('oklch');
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

describe('strToColorSpace — cross-space conversion', () => {
  beforeEach(() => setColorSpace('rgb'));

  it('converts hsl to rgb', () => {
    expect(strToColorSpace('hsl(200 40% 50%)')).toBe('rgb(77 144 179)');
    expect(strToColorSpace('hsl(0 100% 50%)')).toBe('rgb(255 0 0)');
    expect(strToColorSpace('hsl(120 100% 50%)')).toBe('rgb(0 255 0)');
    expect(strToColorSpace('hsl(240 100% 50%)')).toBe('rgb(0 0 255)');
  });

  it('converts an achromatic hsl (saturation 0)', () => {
    expect(strToColorSpace('hsl(180 0% 50%)')).toBe('rgb(128 128 128)');
    expect(strToColorSpace('hsl(0 0% 100%)')).toBe('rgb(255 255 255)');
    expect(strToColorSpace('hsl(0 0% 0%)')).toBe('rgb(0 0 0)');
  });

  it('converts a hex literal', () => {
    expect(strToColorSpace('#ff8040')).toBe('rgb(255 128 64)');
    expect(strToColorSpace('#f80')).toBe('rgb(255 136 0)');
  });

  describe('hue units and wrapping', () => {
    it('accepts deg', () => {
      expect(strToColorSpace('hsl(90deg 50% 50%)')).toBe(
        strToColorSpace('hsl(90 50% 50%)'),
      );
    });

    it('accepts turn', () => {
      // 0.5turn = 180deg = cyan
      expect(strToColorSpace('hsl(0.5turn 100% 50%)')).toBe('rgb(0 255 255)');
    });

    it('accepts rad', () => {
      // π rad ≈ 180deg = cyan
      expect(strToColorSpace('hsl(3.14159rad 100% 50%)')).toBe(
        'rgb(0 255 255)',
      );
    });

    it('wraps a negative hue', () => {
      // -90deg is 270deg
      expect(strToColorSpace('hsl(-90 100% 50%)')).toBe(
        strToColorSpace('hsl(270 100% 50%)'),
      );
      expect(strToColorSpace('hsl(-90 100% 50%)')).toBe('rgb(128 0 255)');
    });

    it('wraps a hue above 360', () => {
      // 450deg is 90deg
      expect(strToColorSpace('hsl(450 100% 50%)')).toBe(
        strToColorSpace('hsl(90 100% 50%)'),
      );
      expect(strToColorSpace('hsl(450 100% 50%)')).toBe('rgb(128 255 0)');
    });
  });
});
