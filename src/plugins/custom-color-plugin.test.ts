import { afterEach, describe, expect, it, vi } from 'vitest';

import { configure, resetConfig } from '../config';
import { parseColor, parseStyle } from '../utils/styles';
import {
  resetColorSpace,
  setColorSpace,
  strToColorSpace,
} from '../utils/color-space';

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
    resetColorSpace();
  });

  it('parses a custom color function into rgb() via the parser', () => {
    configure({ plugins: [mycolorPlugin()] });

    expect(parseStyle('mycolor(255 0 0)').output).toBe('rgb(255 0 0)');
  });

  it('resolves a custom color function through strToColorSpace', () => {
    configure({ plugins: [mycolorPlugin()] });
    setColorSpace('rgb');

    expect(strToColorSpace('mycolor(255 0 0)')).toBe('rgb(255 0 0)');
    expect(strToColorSpace('mycolor(255 0 0 / 0.5)')).toBe(
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
      '[labeled] Expected 3 values (H C L), got:',
      [],
    );

    warnSpy.mockRestore();
  });
});
