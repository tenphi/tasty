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
import { transitionStyle } from './transition';
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
      '--current-color': 'var(--current-fill-hover)',
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

  /**
   * A `-color` suffix is the only hint the parser has about a reference, so it
   * used to decide the *bucket* outright: the reference went to `colors` alone and
   * a handler reading `values` came up empty and emitted its own default instead —
   * `padding: '$brand-color'` silently became `padding: var(--gap)`.
   *
   * The suffix may still *add* reach (a color slot can read it, which is what the
   * form is for), but it must never cost the reference a slot it would otherwise
   * have filled.
   */
  it('never drops a `-color`-suffixed reference', () => {
    const dropped: string[] = [];

    for (const styleName of Object.keys(STYLE_HANDLER_MAP)) {
      const plainCss = renderStyles({ [styleName]: '$my-prop' })
        .rules.map((rule) => rule.declarations)
        .join(' ');
      const suffixedCss = renderStyles({ [styleName]: '$my-prop-color' })
        .rules.map((rule) => rule.declarations)
        .join(' ');

      if (
        plainCss.includes('var(--my-prop)') &&
        !suffixedCss.includes('var(--my-prop-color)')
      ) {
        dropped.push(`${styleName}: "${plainCss}" vs "${suffixedCss}"`);
      }
    }

    expect(dropped).toEqual([]);
  });

  it('keeps a `-color`-suffixed reference readable as a length', () => {
    expect(
      renderStyles({ padding: '$my-prop-color' }).rules[0].declarations,
    ).toBe('padding: var(--my-prop-color);');
    expect(
      renderStyles({ radius: '$my-prop-color' }).rules[0].declarations,
    ).toBe('border-radius: var(--my-prop-color);');
  });

  it('places a dual-bucket reference in one slot only', () => {
    // Filed under both buckets, so the shorthand must not use it twice.
    expect(outlineStyle({ outline: '2px $my-outline-color' })).toEqual({
      outline: '2px solid var(--my-outline-color)',
    });
  });

  /**
   * `preset` and `transition` interpolate their input into a custom-property
   * *name*, which cannot be indirected through a reference: the name is needed at
   * build time and a reference only resolves in the browser. They used to emit
   * `var(--var(--x)-font-size)` — syntactically fine, unusable as a name, dropped
   * by the browser.
   */
  describe('references where a token name is expected', () => {
    it('falls back to inherit for a preset name', () => {
      expect(presetStyle({ preset: '$my-preset' })).toEqual(
        presetStyle({ preset: 'inherit' }),
      );
    });

    it('skips a transition entry named by a reference', () => {
      expect(transitionStyle({ transition: '$my-transition' })).toBeNull();
    });

    it('keeps the usable entries of a transition list', () => {
      const result = transitionStyle({ transition: 'fill, $my-transition' });

      expect(result?.transition).toContain('background-color');
      expect(result?.transition).not.toContain('var(--var(');
    });

    it('still accepts a reference in a transition value slot', () => {
      // Only the name slot rejects references; the timing is an ordinary value.
      expect(
        transitionStyle({ transition: 'fill $my-duration' })?.transition,
      ).toContain('background-color var(--my-duration)');
    });
  });

  it('leaves values without a reference untouched', () => {
    // The parser lowercases, so pass-through values must skip it entirely.
    expect(presetStyle({ fontFamily: '"Inter", Arial, sans-serif' })).toEqual({
      'font-family': '"Inter", Arial, sans-serif',
    });
    expect(colorStyle({ color: 'var(--myColor)' })).toEqual({
      color: 'var(--myColor)',
      '--current-color': 'var(--myColor)',
    });
    expect(displayStyle({ display: 'inline-flex' })).toEqual({
      display: 'inline-flex',
    });
  });
});
