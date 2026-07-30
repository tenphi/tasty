import { configure, resetConfig } from '../config';

import {
  getColorSpace,
  getColorSpaceComponents,
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

describe('getColorSpaceComponents — ignores alpha', () => {
  beforeEach(() => setColorSpace('rgb'));

  it('returns only RGB components without alpha', () => {
    expect(getColorSpaceComponents('rgba(0, 0, 0, 0)')).toBe('0 0 0');
  });

  it('returns components for opaque colors', () => {
    expect(getColorSpaceComponents('rgb(255, 128, 0)')).toBe('255 128 0');
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

    it('preserves var() components in getColorSpaceComponents', () => {
      expect(getColorSpaceComponents('oklch(var(--hue) .2 20)')).toBe(
        'var(--hue) .2 20',
      );
    });

    it('preserves mixed-case var() names (custom properties are case-sensitive)', () => {
      expect(strToColorSpace('oklch(var(--myHue) .2 20)')).toBe(
        'oklch(var(--myHue) .2 20)',
      );
      expect(getColorSpaceComponents('oklch(var(--myHue) .2 20)')).toBe(
        'var(--myHue) .2 20',
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

    it('preserves wide-gamut oklch components without sRGB clamping', () => {
      expect(getColorSpaceComponents('oklch(0.7 0.35 30)')).toBe('0.7 0.35 30');
    });

    it('normalizes a percentage lightness component to a 0-1 number', () => {
      expect(getColorSpaceComponents('oklch(70% 0.2 20)')).toBe('0.7 0.2 20');
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

    it('normalizes static rgb percentage channels to 0-255 components', () => {
      // Mirrors okhsl()/okhst() -> rgb(...%) parser output.
      expect(getColorSpaceComponents('rgb(100% 100% 100%)')).toBe(
        '255 255 255',
      );
      expect(getColorSpaceComponents('rgb(0% 0% 0%)')).toBe('0 0 0');
    });

    it('keeps dynamic rgb channels verbatim in components', () => {
      expect(getColorSpaceComponents('rgb(var(--r) var(--g) var(--b))')).toBe(
        'var(--r) var(--g) var(--b)',
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
