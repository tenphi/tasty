import { color } from './colors';
import { getRgbValuesFromRgbaString, parseColor, strToRgb } from './styles';
import { resetColorSpace, setColorSpace, strToColorSpace } from './color-space';

describe('getRgbValuesFromRgbaString', () => {
  it('extracts RGB values from comma-separated integers', () => {
    expect(getRgbValuesFromRgbaString('rgb(255, 128, 0)')).toEqual([
      255, 128, 0,
    ]);
    expect(getRgbValuesFromRgbaString('rgba(10, 20, 30)')).toEqual([
      10, 20, 30,
    ]);
  });

  it('extracts RGB values from space-separated integers', () => {
    expect(getRgbValuesFromRgbaString('rgb(255 128 0)')).toEqual([255, 128, 0]);
    expect(getRgbValuesFromRgbaString('rgba(10 20 30)')).toEqual([10, 20, 30]);
  });

  it('extracts RGB values from fractional numbers', () => {
    expect(getRgbValuesFromRgbaString('rgb(128.5, 64.3, 32.1)')).toEqual([
      128.5, 64.3, 32.1,
    ]);
    expect(getRgbValuesFromRgbaString('rgb(128.5 64.3 32.1)')).toEqual([
      128.5, 64.3, 32.1,
    ]);
  });

  it('converts percentage values to 0-255 range', () => {
    expect(getRgbValuesFromRgbaString('rgb(50%, 25%, 75%)')).toEqual([
      127.5, 63.75, 191.25,
    ]);
    expect(getRgbValuesFromRgbaString('rgb(100%, 0%, 50%)')).toEqual([
      255, 0, 127.5,
    ]);
  });

  it('handles slash alpha notation (ignores alpha, returns RGB only)', () => {
    expect(getRgbValuesFromRgbaString('rgb(255 128 0 / 0.5)')).toEqual([
      255, 128, 0,
    ]);
    expect(getRgbValuesFromRgbaString('rgb(255 128 0 / .75)')).toEqual([
      255, 128, 0,
    ]);
    expect(getRgbValuesFromRgbaString('rgba(10 20 30 / 50%)')).toEqual([
      10, 20, 30,
    ]);
  });

  it('handles mixed fractional with alpha', () => {
    expect(getRgbValuesFromRgbaString('rgb(128.5 64.3 32.1 / .75)')).toEqual([
      128.5, 64.3, 32.1,
    ]);
  });

  it('returns empty array for invalid input', () => {
    expect(getRgbValuesFromRgbaString('invalid')).toEqual([]);
    expect(getRgbValuesFromRgbaString('#fff')).toEqual([]);
    expect(getRgbValuesFromRgbaString('')).toEqual([]);
  });
});

describe('strToRgb', () => {
  it('passes through rgb values', () => {
    expect(strToRgb('rgb(255 100 50)')).toBe('rgb(255 100 50)');
    expect(strToRgb('rgba(255, 100, 50, 0.5)')).toBe('rgba(255, 100, 50, 0.5)');
  });

  it('converts hex to rgb', () => {
    // hexToRgb returns comma-separated format
    expect(strToRgb('#ff0000')).toBe('rgb(255 0 0)');
    expect(strToRgb('#fff')).toBe('rgb(255 255 255)');
  });

  it('converts hsl to rgb', () => {
    expect(strToRgb('hsl(0 100% 50%)')).toBe('rgb(255 0 0)');
    expect(strToRgb('hsl(120 100% 50%)')).toBe('rgb(0 255 0)');
    expect(strToRgb('hsl(240 100% 50%)')).toBe('rgb(0 0 255)');
  });

  it('converts hsl with alpha (modern slash syntax)', () => {
    expect(strToRgb('hsl(0 100% 50% / 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
    expect(strToRgb('hsla(120 100% 50% / 0.8)')).toBe('rgba(0, 255, 0, 0.8)');
  });

  it('converts hsla with alpha (legacy comma syntax)', () => {
    expect(strToRgb('hsla(0, 100%, 50%, 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
    expect(strToRgb('hsla(120, 100%, 50%, 0.8)')).toBe('rgba(0, 255, 0, 0.8)');
  });

  it('converts okhsl to rgb', () => {
    // okhsl is a plugin-provided color function, so conversion goes through
    // the parser via strToColorSpace rather than the leaf strToRgb helper.
    setColorSpace('rgb');
    try {
      // Purple: okhsl(280.3 80% 52%) should produce a blueish-purple color
      const result = strToColorSpace('okhsl(280.3 80% 52%)');
      expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);

      // Extract RGB values and verify they're in the purple range
      const match = result?.match(/rgb\((\d+) (\d+) (\d+)\)/);
      expect(match).toBeTruthy();

      const [, _r, g, b] = match!;
      // Purple should have significant blue, lower red, and low green
      expect(parseInt(b)).toBeGreaterThan(parseInt(g));
    } finally {
      resetColorSpace();
    }
  });

  it('converts okhsl with alpha to rgba', () => {
    setColorSpace('rgb');
    try {
      const result = strToColorSpace('okhsl(280.3 80% 52% / 0.5)');
      expect(result).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.5\)$/);
    } finally {
      resetColorSpace();
    }
  });

  it('converts oklch to rgb', () => {
    const result = strToRgb('oklch(50% 0.2 250)');
    expect(result).toMatch(/^rgb\(\d+ \d+ \d+\)$/);
  });

  it('returns null for unknown formats', () => {
    expect(strToRgb('unknown')).toBeNull();
  });

  it('returns undefined for falsy input', () => {
    expect(strToRgb('')).toBeUndefined();
    expect(strToRgb(null)).toBeUndefined();
    expect(strToRgb(undefined)).toBeUndefined();
  });
});

describe('parseColor with the opacity wrapper', () => {
  it('reads the name and the opacity through the color-mix() wrapper', () => {
    // `#purple.5` parses to `color-mix(in oklab, var(--purple-color) 50%,
    // transparent)`. The wrapper is the colour, but the name and the opacity
    // belong to what it wraps.
    const parsed = parseColor('#purple.5');

    expect(parsed.color).toBe(
      'color-mix(in oklab, var(--purple-color) 50%, transparent)',
    );
    expect(parsed.name).toBe('purple');
    expect(parsed.opacity).toBe(50);
  });

  it('reports no opacity for a dynamic alpha', () => {
    const parsed = parseColor('#purple.$fade');

    expect(parsed.name).toBe('purple');
    expect(parsed.opacity).toBeUndefined();
  });

  it('still reads a slash alpha off a static color function', () => {
    expect(parseColor('rgb(255 0 0 / .25)').opacity).toBe(25);
  });

  it('does not name a color after an operand of a color function', () => {
    const parsed = parseColor('color-mix(in oklab, #purple 50%, #red)');

    expect(parsed.name).toBeUndefined();
    expect(parsed.opacity).toBeUndefined();
  });
});

describe('color() helper', () => {
  it('returns the bare variable at full opacity', () => {
    expect(color('purple')).toBe('var(--purple-color)');
  });

  it('fades the colour variable with color-mix()', () => {
    expect(color('purple', 0.5)).toBe(
      'color-mix(in oklab, var(--purple-color) 50%, transparent)',
    );
  });

  it('does not leak float artifacts into the percentage', () => {
    // 0.07 * 100 is 7.000000000000001 in IEEE 754.
    expect(color('purple', 0.07)).toBe(
      'color-mix(in oklab, var(--purple-color) 7%, transparent)',
    );
    expect(color('purple', 0.29)).toBe(
      'color-mix(in oklab, var(--purple-color) 29%, transparent)',
    );
  });

  it('keeps a genuinely fractional percentage', () => {
    expect(color('purple', 0.025)).toBe(
      'color-mix(in oklab, var(--purple-color) 2.5%, transparent)',
    );
  });
});
