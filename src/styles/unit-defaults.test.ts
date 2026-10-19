import { CUSTOM_UNITS, getGlobalParser } from '../utils/styles';

import { borderStyle } from './border';
import { fadeStyle } from './fade';
import { logicalStyleHandlers } from './logical';
import { marginStyle } from './margin';
import { outlineStyle } from './outline';
import { paddingStyle } from './padding';
import { radiusStyle } from './radius';
import { widthStyle } from './width';

/**
 * A group that names no value (`padding: 'top'`) takes the same unit default as
 * the boolean form (`padding: true`), so changing the unit scale through
 * `configure({ units })` changes both. These used to read token variables
 * (`var(--gap)`, `var(--radius)`, …) that no unit change could reach, and with
 * no `$gap` token `padding: 'top'` was half of `padding: true`.
 */
describe('value-less groups resolve through the units', () => {
  const CONFIGURED = { x: '5px', r: '7px', bw: '2px', ow: '4px' };

  // [name, render, built-in units, configured units]
  const cases: [string, () => unknown, unknown, unknown][] = [
    [
      'padding',
      () => paddingStyle({ padding: 'top' }),
      { padding: '8px 0 0 0' },
      { padding: '5px 0 0 0' },
    ],
    [
      'margin',
      () => marginStyle({ margin: 'top' }),
      { margin: '8px 0 0 0' },
      { margin: '5px 0 0 0' },
    ],
    [
      'blockPadding',
      () => logicalStyleHandlers.blockPadding({ blockPadding: 'start' }),
      { 'padding-block': '8px 0' },
      { 'padding-block': '5px 0' },
    ],
    [
      'inlineMargin',
      () => logicalStyleHandlers.inlineMargin({ inlineMargin: 'end' }),
      { 'margin-inline': '0 8px' },
      { 'margin-inline': '0 5px' },
    ],
    [
      'radius corner',
      () => radiusStyle({ radius: 'top-right' }),
      { 'border-radius': '0 6px 0 0' },
      { 'border-radius': '0 7px 0 0' },
    ],
    [
      'radius leaf',
      () => radiusStyle({ radius: 'leaf' }),
      {
        'border-radius': 'var(--sharp-radius) 6px var(--sharp-radius) 6px',
      },
      {
        'border-radius': 'var(--sharp-radius) 7px var(--sharp-radius) 7px',
      },
    ],
    [
      'border side',
      () => borderStyle({ border: 'dotted left' })?.['border-left'],
      '1px dotted var(--border-color, currentColor)',
      '2px dotted var(--border-color, currentColor)',
    ],
    [
      'outline',
      () => outlineStyle({ outline: 'dotted' }),
      { outline: '3px dotted var(--outline-color)' },
      { outline: '4px dotted var(--outline-color)' },
    ],
    [
      'fade',
      () => fadeStyle({ fade: 'top' })?.mask,
      'linear-gradient(to bottom, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / 1) 16px)',
      'linear-gradient(to bottom, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / 1) 10px)',
    ],
    [
      'width min',
      () => widthStyle({ width: 'min' })?.['min-width'],
      '8px',
      '5px',
    ],
  ];

  afterEach(() => {
    getGlobalParser().setUnits(CUSTOM_UNITS);
  });

  it.each(cases)('%s uses the built-in units', (_, run, builtIn) => {
    expect(run()).toEqual(builtIn);
  });

  it.each(cases)('%s follows configured units', (_, run, __, configured) => {
    getGlobalParser().setUnits({ ...CUSTOM_UNITS, ...CONFIGURED });

    expect(run()).toEqual(configured);
  });

  it('matches the boolean form', () => {
    expect(paddingStyle({ padding: 'top' })).toEqual({
      padding: `${paddingStyle({ padding: true })!.padding} 0 0 0`,
    });
    expect(radiusStyle({ radius: 'top-right' })).toEqual({
      'border-radius': `0 ${radiusStyle({ radius: true })!['border-radius']} 0 0`,
    });
    expect(borderStyle({ border: 'left' })!['border-left']).toBe(
      borderStyle({ border: true })!.border,
    );
    expect(outlineStyle({ outline: 'solid' })).toEqual(
      outlineStyle({ outline: true }),
    );
  });

  it('can point a unit at a custom property', () => {
    getGlobalParser().setUnits({ ...CUSTOM_UNITS, x: 'var(--gap)' });

    expect(paddingStyle({ padding: 'top' })).toEqual({
      padding: 'var(--gap) 0 0 0',
    });
    expect(fadeStyle({ fade: 'top' })!.mask).toContain('calc(2 * var(--gap))');
  });
});
