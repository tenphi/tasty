import { color } from './colors';
import { getRgbValuesFromRgbaString, parseColor, strToRgb } from './styles';
import { resolveFunctionColor } from './function-color';

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

describe('parseColor with a faded color', () => {
  it('reads the name and the opacity through the fade', () => {
    // `#purple.5` parses to `oklch(from var(--purple-color) l c h / .5)`. The
    // whole thing is the color, but the name and the opacity are its parts.
    const parsed = parseColor('#purple.5');

    expect(parsed.color).toBe('oklch(from var(--purple-color) l c h / .5)');
    expect(parsed.name).toBe('purple');
    expect(parsed.opacity).toBe(50);
  });

  it('reports no opacity for a dynamic alpha', () => {
    const parsed = parseColor('#purple.$fade');

    expect(parsed.name).toBe('purple');
    expect(parsed.opacity).toBeUndefined();
  });

  it('reads a percentage alpha as itself', () => {
    expect(
      parseColor('oklch(from var(--purple-color) l c h / 40%)').opacity,
    ).toBe(40);
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

  it('fades the colour variable with relative color syntax', () => {
    expect(color('purple', 0.5)).toBe(
      'oklch(from var(--purple-color) l c h / 0.5)',
    );
  });

  it('passes the opacity through without arithmetic', () => {
    // The alpha slot takes a `<number>`, so there is no percentage conversion to
    // introduce a float artifact — `0.07 * 100` is `7.000000000000001`.
    expect(color('purple', 0.07)).toBe(
      'oklch(from var(--purple-color) l c h / 0.07)',
    );
    expect(color('purple', 0.29)).toBe(
      'oklch(from var(--purple-color) l c h / 0.29)',
    );
    expect(color('purple', 0.025)).toBe(
      'oklch(from var(--purple-color) l c h / 0.025)',
    );
  });
});

describe('resolveFunctionColor', () => {
  // A plugin-provided color function is not a native CSS format, so the leaf
  // `strToRgb` converter returns null for it (asserted in color-math.test.ts).
  // It resolves through the parser instead — this is the generic path that
  // replaced the hardcoded okhsl/okhst branches.
  it('resolves okhsl() to an rgb() color', () => {
    const result = resolveFunctionColor('okhsl(280.3 80% 52%)');

    expect(result).toMatch(/^rgb\(/);

    // Purple: significant blue, low green.
    const [, r, g, b] =
      result!.match(/rgb\(([\d.]+)% ([\d.]+)% ([\d.]+)%\)/) ?? [];
    expect(parseFloat(b)).toBeGreaterThan(parseFloat(g));
    expect(parseFloat(b)).toBeGreaterThan(parseFloat(r));
  });

  it('keeps the alpha when resolving okhsl()', () => {
    expect(resolveFunctionColor('okhsl(280.3 80% 52% / 0.5)')).toMatch(
      /^rgb\(.+ \/ 0\.5\)$/,
    );
  });

  it('returns null for a function that is not registered', () => {
    expect(resolveFunctionColor('notafunc(1 2 3)')).toBeNull();
  });

  it('returns null for a value that is not a function call', () => {
    expect(resolveFunctionColor('red')).toBeNull();
  });
});
