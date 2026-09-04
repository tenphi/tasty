import { createHash } from 'node:crypto';

import {
  getNamedColorHex,
  getRgbValuesFromRgbaString,
  hexToRgb,
  hslStringToRgb,
  hslToRgbValues,
  okhslToSrgb,
  okhstToSrgb,
  oklchStringToRgb,
  oklchToRgbValues,
  srgbLinearToGamma,
  srgbToLinear,
  srgbToOkhsl,
  strToRgb,
  toTone,
  fromTone,
} from './color-math';

describe('getNamedColorHex', () => {
  it('returns the complete CSS named-color table with stable identity and order', () => {
    const colors = getNamedColorHex();

    expect(colors.size).toBe(148);
    expect([...colors.keys()].slice(0, 2)).toEqual([
      'aliceblue',
      'antiquewhite',
    ]);
    expect(colors.get('rebeccapurple')).toBe('#663399');
    expect(colors.get('yellowgreen')).toBe('#9acd32');
    expect(
      createHash('sha256')
        .update(JSON.stringify([...colors]))
        .digest('hex'),
    ).toBe('2949c59aab6154988afb83744b954bd58146a06ada4d53831e6720ee01f64d0c');
    expect(getNamedColorHex()).toBe(colors);
  });
});

// ============================================================================
// Gamma transfer functions
// ============================================================================

describe('srgbToLinear / srgbLinearToGamma', () => {
  it('round-trips values in [0, 1]', () => {
    for (const v of [0, 0.01, 0.04045, 0.1, 0.5, 0.9, 1]) {
      const linear = srgbToLinear(v);
      const back = srgbLinearToGamma(linear);
      expect(back).toBeCloseTo(v, 6);
    }
  });

  it('returns 0 for 0', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbLinearToGamma(0)).toBe(0);
  });
});

// ============================================================================
// OKHST Tone Transfers
// ============================================================================

describe('OKHST tone transfers', () => {
  it('round-trips tone to lightness and back', () => {
    for (const t of [0, 10, 50, 90, 100]) {
      const l = fromTone(t);
      const back = toTone(l);
      expect(back).toBeCloseTo(t, 4);
    }
  });

  it('maps endpoints correctly', () => {
    expect(fromTone(0)).toBeCloseTo(0, 4);
    expect(fromTone(100)).toBeCloseTo(1, 4);
    expect(toTone(0)).toBeCloseTo(0, 4);
    expect(toTone(1)).toBeCloseTo(100, 4);
  });

  it('agrees with OKHSL on the gray axis when L = fromTone(T)', () => {
    for (const t of [0, 25, 50, 75, 100]) {
      const l = fromTone(t);
      const rgbFromHst = okhstToSrgb(180, 0, t / 100);
      const rgbFromHsl = okhslToSrgb(180, 0, l);
      expect(rgbFromHst[0]).toBeCloseTo(rgbFromHsl[0], 4);
      expect(rgbFromHst[1]).toBeCloseTo(rgbFromHsl[1], 4);
      expect(rgbFromHst[2]).toBeCloseTo(rgbFromHsl[2], 4);
    }
  });
});

// ============================================================================
// HSL <-> RGB
// ============================================================================

describe('hslToRgbValues', () => {
  it('converts pure red', () => {
    const [r, g, b] = hslToRgbValues(0, 1, 0.5);
    expect(Math.round(r)).toBe(255);
    expect(Math.round(g)).toBe(0);
    expect(Math.round(b)).toBe(0);
  });

  it('converts pure green', () => {
    const [r, g, b] = hslToRgbValues(120, 1, 0.5);
    expect(Math.round(r)).toBe(0);
    expect(Math.round(g)).toBe(255);
    expect(Math.round(b)).toBe(0);
  });

  it('converts pure blue', () => {
    const [r, g, b] = hslToRgbValues(240, 1, 0.5);
    expect(Math.round(r)).toBe(0);
    expect(Math.round(g)).toBe(0);
    expect(Math.round(b)).toBe(255);
  });

  it('converts white', () => {
    const [r, g, b] = hslToRgbValues(0, 0, 1);
    expect(Math.round(r)).toBe(255);
    expect(Math.round(g)).toBe(255);
    expect(Math.round(b)).toBe(255);
  });

  it('converts black', () => {
    const [r, g, b] = hslToRgbValues(0, 0, 0);
    expect(Math.round(r)).toBe(0);
    expect(Math.round(g)).toBe(0);
    expect(Math.round(b)).toBe(0);
  });
});

// ============================================================================
// OKHSL <-> sRGB
// ============================================================================

describe('okhslToSrgb', () => {
  it('returns black for lightness 0', () => {
    const [r, g, b] = okhslToSrgb(0, 0, 0);
    expect(r).toBeCloseTo(0, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
  });

  it('returns white for lightness 1', () => {
    const [r, g, b] = okhslToSrgb(0, 0, 1);
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(1, 3);
    expect(b).toBeCloseTo(1, 3);
  });

  it('returns a value in [0,1] range', () => {
    const [r, g, b] = okhslToSrgb(240, 0.8, 0.5);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1);
  });
});

describe('srgbToOkhsl', () => {
  it('returns L=0 for black', () => {
    const [_h, _s, l] = srgbToOkhsl([0, 0, 0]);
    expect(l).toBeCloseTo(0, 3);
  });

  it('returns L=1 for white', () => {
    const [_h, _s, l] = srgbToOkhsl([1, 1, 1]);
    expect(l).toBeCloseTo(1, 3);
  });
});

describe('OKHSL round-trip', () => {
  const testColors: [number, number, number][] = [
    [0.2, 0.3, 0.4],
    [0.9, 0.1, 0.1],
    [0.1, 0.9, 0.1],
    [0.1, 0.1, 0.9],
    [0.5, 0.5, 0.5],
    [0.8, 0.2, 0.6],
    [0.3, 0.7, 0.4],
  ];

  it.each(testColors)(
    'round-trips sRGB (%f, %f, %f) through OKHSL',
    (r, g, b) => {
      const okhsl = srgbToOkhsl([r, g, b]);
      const [r2, g2, b2] = okhslToSrgb(okhsl[0], okhsl[1], okhsl[2]);
      expect(r2).toBeCloseTo(r, 1);
      expect(g2).toBeCloseTo(g, 1);
      expect(b2).toBeCloseTo(b, 1);
    },
  );
});

// ============================================================================
// OKHSL green-region accuracy (verifies k4 sign fix)
// ============================================================================

describe('OKHSL green-region accuracy', () => {
  const greenHues: [number, number, number][] = [
    [120, 0.8, 0.5],
    [130, 0.9, 0.6],
    [140, 0.7, 0.4],
    [150, 0.6, 0.7],
    [100, 0.85, 0.55],
    [110, 0.95, 0.45],
  ];

  it.each(greenHues)(
    'round-trips OKHSL(%f, %f, %f) through sRGB with high precision',
    (h, s, l) => {
      const [r, g, b] = okhslToSrgb(h, s, l);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);

      const [h2, s2, l2] = srgbToOkhsl([r, g, b]);
      const hDiff = Math.abs(h - h2);
      const hWrapped = hDiff > 180 ? 360 - hDiff : hDiff;
      expect(hWrapped).toBeLessThan(1);
      expect(s2).toBeCloseTo(s, 2);
      expect(l2).toBeCloseTo(l, 2);
    },
  );

  it('produces pure green close to sRGB (0, 1, 0)', () => {
    const rgb = okhslToSrgb(142, 1, 0.845);
    expect(rgb[0]).toBeLessThan(0.15);
    expect(rgb[1]).toBeGreaterThan(0.85);
    expect(rgb[2]).toBeLessThan(0.15);
  });
});

// ============================================================================
// hexToRgbValues
// ============================================================================

// ============================================================================
// String converters
// ============================================================================

describe('hexToRgb', () => {
  it('converts 6-digit hex', () => {
    expect(hexToRgb('#ff0000')).toBe('rgb(255 0 0)');
    expect(hexToRgb('#00ff00')).toBe('rgb(0 255 0)');
  });

  it('converts 3-digit hex', () => {
    expect(hexToRgb('#fff')).toBe('rgb(255 255 255)');
    expect(hexToRgb('#000')).toBe('rgb(0 0 0)');
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('#xyz')).toBeNull();
    expect(hexToRgb('')).toBeNull();
  });
});

describe('getRgbValuesFromRgbaString', () => {
  it('extracts from space-separated', () => {
    expect(getRgbValuesFromRgbaString('rgb(255 128 0)')).toEqual([255, 128, 0]);
  });

  it('extracts from comma-separated', () => {
    expect(getRgbValuesFromRgbaString('rgb(255, 128, 0)')).toEqual([
      255, 128, 0,
    ]);
  });

  it('handles percentages', () => {
    expect(getRgbValuesFromRgbaString('rgb(100%, 0%, 50%)')).toEqual([
      255, 0, 127.5,
    ]);
  });

  it('handles slash alpha (ignores alpha)', () => {
    expect(getRgbValuesFromRgbaString('rgb(255 128 0 / 0.5)')).toEqual([
      255, 128, 0,
    ]);
  });

  it('returns empty for invalid input', () => {
    expect(getRgbValuesFromRgbaString('invalid')).toEqual([]);
  });
});

describe('strToRgb', () => {
  it('passes through rgb', () => {
    expect(strToRgb('rgb(255 100 50)')).toBe('rgb(255 100 50)');
  });

  it('converts hex', () => {
    expect(strToRgb('#ff0000')).toBe('rgb(255 0 0)');
  });

  it('converts hsl', () => {
    expect(strToRgb('hsl(0 100% 50%)')).toBe('rgb(255 0 0)');
  });

  it('converts named colors', () => {
    expect(strToRgb('red')).toBe('rgb(255 0 0)');
    expect(strToRgb('blue')).toBe('rgb(0 0 255)');
  });

  it('returns null for plugin-provided color functions (okhsl)', () => {
    // strToRgb is a leaf converter for native CSS color formats only.
    // Plugin-provided color functions such as okhsl are resolved through the
    // parser (see `resolveFunctionColor`), not here.
    expect(strToRgb('okhsl(280 80% 52%)')).toBeNull();
  });

  it('returns null for unknown', () => {
    expect(strToRgb('unknown')).toBeNull();
  });

  it('returns undefined for empty', () => {
    expect(strToRgb('')).toBeUndefined();
  });
});

describe('hslStringToRgb', () => {
  it('converts modern syntax', () => {
    expect(hslStringToRgb('hsl(0 100% 50%)')).toBe('rgb(255 0 0)');
    expect(hslStringToRgb('hsl(120 100% 50%)')).toBe('rgb(0 255 0)');
  });

  it('converts legacy comma syntax', () => {
    expect(hslStringToRgb('hsl(0, 100%, 50%)')).toBe('rgb(255 0 0)');
  });

  it('handles alpha (slash)', () => {
    expect(hslStringToRgb('hsl(0 100% 50% / 0.5)')).toBe(
      'rgba(255, 0, 0, 0.5)',
    );
  });

  it('handles hsla legacy alpha', () => {
    expect(hslStringToRgb('hsla(0, 100%, 50%, 0.5)')).toBe(
      'rgba(255, 0, 0, 0.5)',
    );
  });

  it('returns null for invalid', () => {
    expect(hslStringToRgb('invalid')).toBeNull();
  });
});

// ============================================================================
// OKLCH -> RGB
// ============================================================================

describe('oklchToRgbValues', () => {
  it('converts black (L=0)', () => {
    const [r, g, b] = oklchToRgbValues(0, 0, 0);
    expect(Math.round(r)).toBe(0);
    expect(Math.round(g)).toBe(0);
    expect(Math.round(b)).toBe(0);
  });

  it('converts white (L=1, C=0)', () => {
    const [r, g, b] = oklchToRgbValues(1, 0, 0);
    expect(Math.round(r)).toBe(255);
    expect(Math.round(g)).toBe(255);
    expect(Math.round(b)).toBe(255);
  });

  it('converts a chromatic colour to its sRGB values', () => {
    // sRGB red is oklch(0.62796 0.25768 29.23).
    const [r, g, b] = oklchToRgbValues(0.62796, 0.25768, 29.23);
    expect(Math.round(r)).toBe(255);
    expect(Math.round(g)).toBe(0);
    expect(Math.round(b)).toBe(0);
  });

  it('clamps out-of-gamut values to 0-255', () => {
    const [r, g, b] = oklchToRgbValues(0.5, 0.4, 150);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(255);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(255);
  });
});

describe('oklchStringToRgb', () => {
  it('converts basic oklch', () => {
    const result = oklchStringToRgb('oklch(0.5 0.2 240)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('converts oklch with percentage lightness', () => {
    const result = oklchStringToRgb('oklch(50% 0.2 240)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('handles alpha (slash notation)', () => {
    const result = oklchStringToRgb('oklch(0.5 0.2 240 / 0.5)');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  });

  it('handles deg unit on hue', () => {
    const result = oklchStringToRgb('oklch(0.5 0.2 240deg)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
    expect(result).toBe(oklchStringToRgb('oklch(0.5 0.2 240)'));
  });

  it('handles turn unit on hue', () => {
    const result = oklchStringToRgb('oklch(0.5 0.2 0.5turn)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
    expect(result).toBe(oklchStringToRgb('oklch(0.5 0.2 180)'));
  });

  it('handles rad unit on hue', () => {
    const result = oklchStringToRgb('oklch(0.5 0.2 3.14159rad)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
    const withDeg = oklchStringToRgb('oklch(0.5 0.2 180)');
    expect(result).toBe(withDeg);
  });

  it('returns null for invalid input', () => {
    expect(oklchStringToRgb('invalid')).toBeNull();
    expect(oklchStringToRgb('oklch()')).toBeNull();
    expect(oklchStringToRgb('oklch(0.5 0.2)')).toBeNull();
  });

  it('produces consistent results with oklchToRgbValues', () => {
    const str = oklchStringToRgb('oklch(0.7 0.15 120)');
    const [r, g, b] = oklchToRgbValues(0.7, 0.15, 120);
    expect(str).toBe(`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`);
  });

  it('converts black', () => {
    expect(oklchStringToRgb('oklch(0 0 0)')).toBe('rgb(0 0 0)');
  });

  it('converts white', () => {
    expect(oklchStringToRgb('oklch(1 0 0)')).toBe('rgb(255 255 255)');
  });
});

describe('strToRgb with oklch', () => {
  it('converts oklch input', () => {
    const result = strToRgb('oklch(0.5 0.2 240)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('converts oklch with alpha', () => {
    const result = strToRgb('oklch(0.5 0.2 240 / 0.8)');
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.8\)$/);
  });
});
