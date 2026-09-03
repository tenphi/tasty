import { renderStyles } from '../pipeline';
import { CHUNK_NAMES, STYLE_TO_CHUNK } from '../chunks/style-chunk-map';

import { blockSizeStyle } from './blockSize';
import { inlineSizeStyle } from './inlineSize';
import { STYLE_HANDLER_MAP } from './index';
import {
  LOGICAL_BORDER_STYLES,
  LOGICAL_INSET_STYLES,
  LOGICAL_MARGIN_STYLES,
  LOGICAL_PADDING_STYLES,
  LOGICAL_RADIUS_STYLES,
  LOGICAL_SCROLL_MARGIN_STYLES,
  LOGICAL_SCROLL_PADDING_STYLES,
  LOGICAL_SIZE_STYLES,
} from './logical-list';
import { logicalStyleHandlers } from './logical';

describe('logical style handlers', () => {
  it('registers exactly one independent handler per logical declaration', () => {
    for (const [styleName, handler] of Object.entries(logicalStyleHandlers)) {
      expect(handler.__lookupStyles).toEqual([styleName]);
      expect(STYLE_HANDLER_MAP[styleName]).toEqual([handler]);
    }

    expect(blockSizeStyle.__lookupStyles).toEqual(['blockSize']);
    expect(inlineSizeStyle.__lookupStyles).toEqual(['inlineSize']);
  });

  it('keeps the shared logical lists aligned with handlers and chunks', () => {
    const handledNames = [
      'blockSize',
      'inlineSize',
      ...Object.keys(logicalStyleHandlers),
    ].sort();
    const listedNames = [
      ...LOGICAL_SIZE_STYLES,
      ...LOGICAL_PADDING_STYLES,
      ...LOGICAL_MARGIN_STYLES,
      ...LOGICAL_INSET_STYLES,
      ...LOGICAL_SCROLL_MARGIN_STYLES,
      ...LOGICAL_SCROLL_PADDING_STYLES,
      ...LOGICAL_BORDER_STYLES,
      ...LOGICAL_RADIUS_STYLES,
    ].sort();

    expect(handledNames).toEqual(listedNames);

    for (const name of [
      ...LOGICAL_SIZE_STYLES,
      ...LOGICAL_PADDING_STYLES,
      ...LOGICAL_MARGIN_STYLES,
    ]) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.DIMENSION);
    }
    for (const name of LOGICAL_INSET_STYLES) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.POSITION);
    }
    for (const name of [...LOGICAL_BORDER_STYLES, ...LOGICAL_RADIUS_STYLES]) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.APPEARANCE);
    }
  });

  it('maps every logical style name to its native kebab-case property', () => {
    const borderShorthands = new Set([
      'borderBlock',
      'borderBlockStart',
      'borderBlockEnd',
      'borderInline',
      'borderInlineStart',
      'borderInlineEnd',
    ]);

    for (const [styleName, handler] of Object.entries(logicalStyleHandlers)) {
      let value = '1x';
      if (borderShorthands.has(styleName)) value = '1bw solid #red';
      else if (styleName.endsWith('Width')) value = '1bw';
      else if (styleName.endsWith('Style')) value = 'solid';
      else if (styleName.endsWith('Color')) value = '#red';
      else if (styleName.endsWith('Radius')) value = '1r';

      const cssProperty = styleName.replace(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`,
      );

      expect(Object.keys(handler({ [styleName]: value }))).toEqual([
        cssProperty,
      ]);
    }
  });

  it.each([
    ['paddingBlock', 'padding-block'],
    ['paddingBlockStart', 'padding-block-start'],
    ['paddingBlockEnd', 'padding-block-end'],
    ['paddingInline', 'padding-inline'],
    ['paddingInlineStart', 'padding-inline-start'],
    ['paddingInlineEnd', 'padding-inline-end'],
    ['marginBlock', 'margin-block'],
    ['marginBlockStart', 'margin-block-start'],
    ['marginBlockEnd', 'margin-block-end'],
    ['marginInline', 'margin-inline'],
    ['marginInlineStart', 'margin-inline-start'],
    ['marginInlineEnd', 'margin-inline-end'],
    ['scrollMarginBlock', 'scroll-margin-block'],
    ['scrollMarginBlockStart', 'scroll-margin-block-start'],
    ['scrollMarginBlockEnd', 'scroll-margin-block-end'],
    ['scrollMarginInline', 'scroll-margin-inline'],
    ['scrollMarginInlineStart', 'scroll-margin-inline-start'],
    ['scrollMarginInlineEnd', 'scroll-margin-inline-end'],
    ['scrollPaddingBlock', 'scroll-padding-block'],
    ['scrollPaddingBlockStart', 'scroll-padding-block-start'],
    ['scrollPaddingBlockEnd', 'scroll-padding-block-end'],
    ['scrollPaddingInline', 'scroll-padding-inline'],
    ['scrollPaddingInlineStart', 'scroll-padding-inline-start'],
    ['scrollPaddingInlineEnd', 'scroll-padding-inline-end'],
  ])('emits %s as the native %s declaration', (styleName, cssProperty) => {
    const handler =
      logicalStyleHandlers[styleName as keyof typeof logicalStyleHandlers];

    expect(handler({ [styleName]: '1x' })).toEqual({
      [cssProperty]: '8px',
    });
  });

  it.each([
    ['paddingBlock', 'padding-block'],
    ['marginInline', 'margin-inline'],
    ['scrollMarginBlock', 'scroll-margin-block'],
    ['scrollPaddingInline', 'scroll-padding-inline'],
  ])('preserves start/end values for the %s axis', (styleName, cssProperty) => {
    const handler =
      logicalStyleHandlers[styleName as keyof typeof logicalStyleHandlers];

    expect(handler({ [styleName]: '1x 2x' })).toEqual({
      [cssProperty]: '8px 16px',
    });
  });

  it.each([
    ['insetBlock', 'inset-block'],
    ['insetBlockStart', 'inset-block-start'],
    ['insetBlockEnd', 'inset-block-end'],
    ['insetInline', 'inset-inline'],
    ['insetInlineStart', 'inset-inline-start'],
    ['insetInlineEnd', 'inset-inline-end'],
  ])('emits %s as the native %s declaration', (styleName, cssProperty) => {
    const handler =
      logicalStyleHandlers[styleName as keyof typeof logicalStyleHandlers];

    expect(handler({ [styleName]: true })).toEqual({ [cssProperty]: '0' });
  });

  it('uses the dimension shorthand syntax for blockSize and inlineSize', () => {
    expect(blockSizeStyle({ blockSize: '1x 5x 10x' })).toEqual({
      'min-block-size': '8px',
      'block-size': '40px',
      'max-block-size': '80px',
    });
    expect(inlineSizeStyle({ inlineSize: 'fixed 12x' })).toEqual({
      'min-inline-size': '96px',
      'inline-size': '96px',
      'max-inline-size': '96px',
    });
  });

  it('keeps explicit logical min/max declarations separate and later', () => {
    const { rules } = renderStyles({
      blockSize: '1x 5x 10x',
      minBlockSize: '2x',
      maxBlockSize: '20x',
    });

    expect(rules.map((rule) => rule.declarations)).toEqual([
      'block-size: 40px; min-block-size: 8px; max-block-size: 80px;',
      'min-block-size: 16px;',
      'max-block-size: 160px;',
    ]);
  });

  it('parses logical border shorthands with Tasty defaults and colors', () => {
    expect(
      logicalStyleHandlers.borderInline({ borderInline: '2bw dashed #red' }),
    ).toEqual({
      'border-inline': '2px dashed var(--red-color)',
    });
    expect(
      logicalStyleHandlers.borderBlockStart({ borderBlockStart: true }),
    ).toEqual({
      'border-block-start': '1px solid var(--border-color, currentColor)',
    });
  });

  it('supports logical border components and corner radii', () => {
    expect(
      logicalStyleHandlers.borderInlineWidth({ borderInlineWidth: '1bw 2bw' }),
    ).toEqual({ 'border-inline-width': '1px 2px' });
    expect(
      logicalStyleHandlers.borderBlockColor({
        borderBlockColor: '#red #blue',
      }),
    ).toEqual({
      'border-block-color': 'var(--red-color) var(--blue-color)',
    });
    expect(
      logicalStyleHandlers.borderStartEndRadius({
        borderStartEndRadius: true,
      }),
    ).toEqual({ 'border-start-end-radius': '6px' });
  });

  it('keeps state maps independent across logical declarations', () => {
    const { rules } = renderStyles({
      paddingBlock: { '': '1x', hovered: '2x' },
      paddingInline: { '': '3x', pressed: '4x' },
    });
    const css = rules.map((rule) => `${rule.selector}{${rule.declarations}}`);

    expect(css).toEqual([
      ':where(:not([data-hovered])){padding-block: 8px;}',
      ':where(:not([data-pressed])){padding-inline: 24px;}',
      ':where([data-hovered]){padding-block: 16px;}',
      ':where([data-pressed]){padding-inline: 32px;}',
    ]);
    expect(
      css.every((rule) => !rule.includes('[data-hovered][data-pressed]')),
    ).toBe(true);
  });
});
