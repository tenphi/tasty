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
