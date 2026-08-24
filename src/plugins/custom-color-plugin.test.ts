import { afterEach, describe, expect, it, vi } from 'vitest';

import { configure, resetConfig } from '../config';
import { resolveFunctionColor } from '../utils/function-color';
import { parseColor, parseStyle } from '../utils/styles';

import { createColorFunc } from './color-func';

import type { StyleDetails } from '../parser/types';
import type { TastyPlugin, TastyPluginFactory } from './types';

// A fully custom color function: maps three 0-255 integers to rgb().
// This is the most general case — a plugin supplies its own parse function
// whose output is an already-supported color. No core integration required.
function mycolorFunc(groups: StyleDetails[]): string {
  if (groups.length === 0 || groups[0].all.length < 3) {
    return 'rgb(0 0 0)';
  }
  const [r, g, b] = groups[0].all
    .slice(0, 3)
    .map((t) => Math.round(parseFloat(t)));
  const alpha =
    groups[0].parts.length > 1 && groups[0].parts[1].all.length > 0
      ? groups[0].parts[1].output
      : undefined;
  return alpha ? `rgb(${r} ${g} ${b} / ${alpha})` : `rgb(${r} ${g} ${b})`;
}

const mycolorPlugin: TastyPluginFactory = (): TastyPlugin => ({
  name: 'mycolor',
  functions: { mycolor: mycolorFunc },
});

// An HSL-style custom color space using the createColorFunc helper (hue + two
// percentages), proving the helper works for third-party spaces too.
const hslStyleConvert = (
  h: number,
  c2: number,
  c3: number,
): [number, number, number] => {
  // toy: ignore hue, return grayscale from c3
  const v = c3;
  return [v, v, v];
};
const hslStylePlugin: TastyPluginFactory = (): TastyPlugin => ({
  name: 'grayscale',
  functions: { grayscale: createColorFunc('grayscale', hslStyleConvert) },
});

describe('custom color function plugin (no core special-casing)', () => {
  afterEach(() => {
    resetConfig();
    // Not in the test bodies: an assertion that throws would skip the cleanup
    // and leak the mocked `console.warn` — with its call history — into the
    // next test, turning one failure into a cascade.
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('parses a custom color function into rgb() via the parser', () => {
    configure({ plugins: [mycolorPlugin()] });

    expect(parseStyle('mycolor(255 0 0)').output).toBe('rgb(255 0 0)');
  });

  it('resolves a custom color function through resolveFunctionColor', () => {
    configure({ plugins: [mycolorPlugin()] });

    expect(resolveFunctionColor('mycolor(255 0 0)')).toBe('rgb(255 0 0)');
    expect(resolveFunctionColor('mycolor(255 0 0 / 0.5)')).toBe(
      'rgb(255 0 0 / 0.5)',
    );
  });

  it('supports alpha via the #token.N syntax through the generic path', () => {
    configure({
      plugins: [mycolorPlugin()],
      replaceTokens: {
        '#brand': 'mycolor(255 128 0)',
      },
    });

    // #brand.5 injects alpha into the custom function output and re-classifies.
    expect(parseStyle('#brand.5').output).toBe('rgb(255 128 0 / .5)');

    // parseColor extracts the opacity from the resulting rgb(... / a).
    expect(parseColor('#brand.5').opacity).toBe(50);
  });

  it('createColorFunc works for a third-party HSL-style color space', () => {
    configure({ plugins: [hslStylePlugin()] });

    // grayscale(120 50% 75%) -> ignores hue, lightness 0.75 -> rgb(75% 75% 75%)
    expect(parseStyle('grayscale(120 50% 75%)').output).toBe(
      'rgb(75% 75% 75%)',
    );
  });

  it('uses the optional label only for dev warnings', () => {
    // The warning is dev-gated, so enable dev mode to observe it.
    vi.stubEnv('NODE_ENV', 'development');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });

    const labeledConvert = (
      h: number,
      c2: number,
      c3: number,
    ): [number, number, number] => [c3, c3, c3];
    const labeledPlugin: TastyPluginFactory = (): TastyPlugin => ({
      name: 'labeled',
      functions: {
        labeled: createColorFunc('labeled', labeledConvert, 'H C L'),
      },
    });

    configure({ plugins: [labeledPlugin()] });

    const fn = labeledPlugin().functions!.labeled;
    expect(fn([])).toBe('rgb(0% 0% 0%)');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Tasty] labeled(): expected 3 values (H C L), got:',
      [],
    );

    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('percentage-scale input', () => {
    // `parsePercentage` reads a unitless number as the factor it looks like, so
    // `okhsl(280 .8 .52)` and `okhsl(280 80% 52%)` are the same color. Dropping
    // the `%` therefore lands 80 in a 0-1 slot, which clamps to full saturation
    // and renders as white — a plausible-looking color, not an obvious mistake.
    it('reads a unitless channel as the same factor a percentage denotes', () => {
      configure({ plugins: [mycolorPlugin()] });

      expect(parseStyle('okhsl(280 0.8 0.52)').output).toBe(
        parseStyle('okhsl(280 80% 52%)').output,
      );
    });

    it('warns once when a channel arrives on the percentage scale', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      expect(parseStyle('okhsl(280 80 52)').output).toBe('rgb(100% 100% 100%)');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('okhsl()');
      expect(warnSpy.mock.calls[0][0]).toContain('"80"');
      expect(warnSpy.mock.calls[0][0]).toContain('to 1');

      // Deduped per function, so a second offending value stays quiet.
      parseStyle('okhsl(100 90 40)');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('stays quiet for a percentage above 100%', () => {
      // `150%` parses to 1.5, which is over-saturation that legitimately
      // clamps — the raw token carries its unit, so it is not a missing `%`.
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      expect(parseStyle('okhsl(280 150% 52%)').output).toBe(
        parseStyle('okhsl(280 100% 52%)').output,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not let a percentage above 100% suppress a later typo', () => {
      // The warning is deduped per function, so a false positive would burn the
      // slot and silence the genuine missing-`%` case that follows.
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      parseStyle('okhsl(190 140% 44%)');
      expect(warnSpy).not.toHaveBeenCalled();

      parseStyle('okhsl(190 70 44)');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('"70"');
    });

    it('names only the offending channel', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      parseStyle('okhsl(240 60 30%)');

      expect(warnSpy.mock.calls[0][0]).toContain('"60" clamps to 1');
      expect(warnSpy.mock.calls[0][0]).not.toContain('30%');
    });

    it('stays quiet at the 1 endpoint, which is a legitimate factor', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      parseStyle('okhsl(280 1 1)');

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('stays quiet in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      // A value no earlier test used: `createColorFunc`'s LRU lives for the
      // process, so a cached value would return before reaching the check and
      // the assertion would pass for the wrong reason.
      expect(parseStyle('okhsl(210 60 35)').output).toBe('rgb(100% 100% 100%)');

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
