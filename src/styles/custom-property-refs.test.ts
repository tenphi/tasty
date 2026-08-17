/**
 * `$name` references must never reach the stylesheet unsubstituted.
 *
 * Handlers for keyword-valued properties emit their input verbatim, and handlers
 * for typed properties pick a single bucket out of the parsed result (`values`
 * for lengths, `colors` for colors) and fall back to the raw input when that
 * bucket is empty. Both used to leak the authored DSL into CSS — `fill:
 * '$my-fill'` emitted `background-color: $my-fill`, an invalid declaration the
 * browser drops, because `$name` is classified as a color only when the name
 * ends with `-color`.
 */
import { resetConfig } from '../config';
import { renderStyles } from '../pipeline';

import { colorStyle } from './color';
import { displayStyle } from './display';
import { fillStyle, svgFillStyle } from './fill';
import { flowStyle } from './flow';
import { outlineStyle } from './outline';
import { placementStyle } from './placement';
import { presetStyle } from './preset';
import { STYLE_HANDLER_MAP } from './index';

describe('custom property references in handler output', () => {
  afterEach(() => {
    resetConfig();
  });

  // Both classifications of `$name` (value bucket and color bucket) plus the
  // fallback form, since handlers read the buckets selectively.
  const VALUES = ['$my-prop', '$my-prop-color', '($my-prop, 1x)'];

  /**
   * Some handlers only reach their interesting branch when a companion prop is
   * set — `flow` needs a `display`, and `whiteSpace` is emitted a second time by
   * the `textOverflow` clamp. Sweeping props one at a time lets those branches
   * return early and pass without ever being exercised.
   */
  const CONTEXTS: Record<string, string>[] = [
    {},
    { display: 'flex' },
    { display: 'grid' },
    { textOverflow: 'ellipsis' },
    { textOverflow: 'ellipsis / 3' },
  ];

  it('never leaves a `$` reference in any registered style prop', () => {
    const leaks: string[] = [];

    for (const styleName of Object.keys(STYLE_HANDLER_MAP)) {
      for (const value of VALUES) {
        for (const context of CONTEXTS) {
          const { rules } = renderStyles({ ...context, [styleName]: value });
          const css = rules.map((rule) => rule.declarations).join(' ');

          if (css.includes('$')) {
            leaks.push(
              `${JSON.stringify({ ...context, [styleName]: value })} → ${css}`,
            );
          }
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it('substitutes a value-bucket reference used as a color', () => {
    // `$current-fill-hover` does not end with `-color`, so the parser puts it in
    // the value bucket and no color is extracted.
    expect(fillStyle({ fill: '$current-fill-hover' })).toEqual({
      'background-color': 'var(--current-fill-hover)',
    });
    expect(colorStyle({ color: '$current-fill-hover' })).toEqual({
      color: 'var(--current-fill-hover)',
    });
    expect(svgFillStyle({ svgFill: '$current-fill-hover' })).toEqual({
      fill: 'var(--current-fill-hover)',
    });
  });

  it('keeps color-bucket references working', () => {
    expect(fillStyle({ fill: '$my-fill-color' })).toEqual({
      'background-color': 'var(--my-fill-color)',
    });
  });

  it('substitutes references in keyword-valued props', () => {
    expect(
      displayStyle({
        display: '$my-display',
        overflow: '$my-overflow',
        whiteSpace: '$my-white-space',
      }),
    ).toEqual({
      display: 'var(--my-display)',
      overflow: 'var(--my-overflow)',
      'white-space': 'var(--my-white-space)',
    });

    // `textOverflow` emits `white-space` itself, a second path to the same
    // declaration.
    expect(
      displayStyle({ textOverflow: 'ellipsis', whiteSpace: '$my-white-space' }),
    ).toEqual({
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'var(--my-white-space)',
    });

    expect(placementStyle({ place: '$my-align $my-justify' })).toEqual({
      'align-items': 'var(--my-align)',
      'justify-items': 'var(--my-justify)',
      'align-content': 'var(--my-align)',
      'justify-content': 'var(--my-justify)',
    });

    expect(flowStyle({ display: 'grid', flow: '$my-flow' })).toEqual({
      'grid-auto-flow': 'var(--my-flow)',
    });

    expect(presetStyle({ textTransform: '$my-transform' })).toEqual({
      'text-transform': 'var(--my-transform)',
    });

    expect(presetStyle({ fontFamily: '$my-font' })).toEqual({
      'font-family': 'var(--my-font)',
    });

    expect(presetStyle({ font: '$my-font' })).toEqual({
      'font-family':
        'var(--my-font), var(--font-sans, var(--font-sans-fallback))',
    });
  });

  it('substitutes a color-bucket reference used as a length', () => {
    // Mirror case: `$name-color` lands in the color bucket, so handlers reading
    // `values[0]` fall back to the raw input.
    expect(presetStyle({ fontSize: '$my-size-color' })).toEqual({
      'font-size': 'var(--my-size-color)',
    });
    expect(outlineStyle({ outlineOffset: '$my-offset-color' })).toEqual({
      'outline-offset': 'var(--my-offset-color)',
    });
  });

  it('leaves values without a reference untouched', () => {
    // The parser lowercases, so pass-through values must skip it entirely.
    expect(presetStyle({ fontFamily: '"Inter", Arial, sans-serif' })).toEqual({
      'font-family': '"Inter", Arial, sans-serif',
    });
    expect(colorStyle({ color: 'var(--myColor)' })).toEqual({
      color: 'var(--myColor)',
    });
    expect(displayStyle({ display: 'inline-flex' })).toEqual({
      display: 'inline-flex',
    });
  });
});
