import { CHUNK_NAMES, STYLE_TO_CHUNK } from '../chunks/style-chunk-map';
import { renderStyles } from '../pipeline';

import { blockSizeStyle } from './blockSize';
import { inlineSizeStyle } from './inlineSize';
import { STYLE_HANDLER_MAP, styleHandlers } from './index';
import {
  LOGICAL_BORDER_STYLES,
  LOGICAL_INSET_STYLES,
  LOGICAL_MARGIN_STYLES,
  LOGICAL_PADDING_STYLES,
  LOGICAL_SCROLL_MARGIN_STYLES,
  LOGICAL_SCROLL_PADDING_STYLES,
  LOGICAL_SIZE_HANDLER_STYLES,
} from './logical-list';
import { logicalStyleHandlers } from './logical';

const LOGICAL_AXIS_STYLES = [
  ...LOGICAL_PADDING_STYLES,
  ...LOGICAL_MARGIN_STYLES,
  ...LOGICAL_INSET_STYLES,
  ...LOGICAL_SCROLL_MARGIN_STYLES,
  ...LOGICAL_SCROLL_PADDING_STYLES,
  ...LOGICAL_BORDER_STYLES,
] as const;

describe('logical style handlers', () => {
  it('registers one handler per logical style category', () => {
    for (const styleName of LOGICAL_AXIS_STYLES) {
      const handler = logicalStyleHandlers[styleName];

      expect(handler.__lookupStyles).toEqual([styleName]);
      expect(STYLE_HANDLER_MAP[styleName]).toEqual([handler]);
    }

    expect(blockSizeStyle.__lookupStyles).toEqual([
      'blockSize',
      'minBlockSize',
      'maxBlockSize',
    ]);
    expect(inlineSizeStyle.__lookupStyles).toEqual([
      'inlineSize',
      'minInlineSize',
      'maxInlineSize',
    ]);
    expect(STYLE_HANDLER_MAP.minBlockSize).toEqual([blockSizeStyle]);
    expect(STYLE_HANDLER_MAP.maxInlineSize).toEqual([inlineSizeStyle]);

    expect(logicalStyleHandlers).not.toHaveProperty('paddingBlock');
    expect(logicalStyleHandlers).not.toHaveProperty('borderInlineStart');
    expect(logicalStyleHandlers).not.toHaveProperty('borderStartStartRadius');
    expect(styleHandlers.blockPadding.__lookupStyles).toEqual(['blockPadding']);
    expect(styleHandlers.inlineBorder.__lookupStyles).toEqual(['inlineBorder']);
    expect(styleHandlers).not.toHaveProperty('paddingBlock');
  });

  it('keeps shared category lists aligned with handlers and chunks', () => {
    expect(Object.keys(logicalStyleHandlers).sort()).toEqual(
      [...LOGICAL_AXIS_STYLES].sort(),
    );

    for (const name of [
      ...LOGICAL_SIZE_HANDLER_STYLES,
      ...LOGICAL_PADDING_STYLES,
      ...LOGICAL_MARGIN_STYLES,
    ]) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.DIMENSION);
    }
    for (const name of [
      ...LOGICAL_INSET_STYLES,
      ...LOGICAL_SCROLL_MARGIN_STYLES,
      ...LOGICAL_SCROLL_PADDING_STYLES,
    ]) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.POSITION);
    }
    for (const name of LOGICAL_BORDER_STYLES) {
      expect(STYLE_TO_CHUNK.get(name)).toBe(CHUNK_NAMES.APPEARANCE);
    }
  });

  it.each([
    ['blockPadding', 'padding-block'],
    ['inlinePadding', 'padding-inline'],
    ['blockMargin', 'margin-block'],
    ['inlineMargin', 'margin-inline'],
    ['blockScrollMargin', 'scroll-margin-block'],
    ['inlineScrollMargin', 'scroll-margin-inline'],
    ['blockScrollPadding', 'scroll-padding-block'],
    ['inlineScrollPadding', 'scroll-padding-inline'],
  ] as const)('maps %s to %s', (styleName, cssProperty) => {
    const handler = logicalStyleHandlers[styleName];

    expect(handler({ [styleName]: '1x 2x' })).toEqual({
      [cssProperty]: '8px 16px',
    });
    expect(handler({ [styleName]: true })).toEqual({
      [cssProperty]: '8px',
    });
  });

  it.each([
    ['blockPadding', 'padding-block'],
    ['inlineMargin', 'margin-inline'],
    ['blockScrollMargin', 'scroll-margin-block'],
    ['inlineScrollPadding', 'scroll-padding-inline'],
  ] as const)(
    'supports start/end modifiers for %s',
    (styleName, cssProperty) => {
      const handler = logicalStyleHandlers[styleName];

      expect(handler({ [styleName]: '1x start, 2x end' })).toEqual({
        [cssProperty]: '8px 16px',
      });
      expect(handler({ [styleName]: '2x end' })).toEqual({
        [cssProperty]: '0 16px',
      });
    },
  );

  it.each([
    ['blockInset', 'inset-block'],
    ['inlineInset', 'inset-inline'],
  ] as const)(
    'uses auto for an unspecified %s edge',
    (styleName, cssProperty) => {
      const handler = logicalStyleHandlers[styleName];

      expect(handler({ [styleName]: '2x start' })).toEqual({
        [cssProperty]: '16px auto',
      });
      expect(handler({ [styleName]: true })).toEqual({ [cssProperty]: '0' });
    },
  );

  it('supports longhand output without combining logical axes', () => {
    expect(
      logicalStyleHandlers.inlinePadding({
        inlinePadding: '1x start, 2x end longhand',
      }),
    ).toEqual({
      'padding-inline-start': '8px',
      'padding-inline-end': '16px',
    });
  });

  it('supports CSS-wide keywords on a whole axis or one edge', () => {
    expect(
      logicalStyleHandlers.blockMargin({ blockMargin: 'inherit' }),
    ).toEqual({ 'margin-block': 'inherit' });
    expect(
      logicalStyleHandlers.inlinePadding({
        inlinePadding: 'inherit start longhand',
      }),
    ).toEqual({
      'padding-inline-start': 'inherit',
      'padding-inline-end': '0',
    });
  });

  it('parses one logical border category with start/end modifiers', () => {
    expect(
      logicalStyleHandlers.inlineBorder({
        inlineBorder: '2bw dashed #red',
      }),
    ).toEqual({
      'border-inline': '2px dashed var(--red-color)',
    });
    expect(
      logicalStyleHandlers.blockBorder({
        blockBorder: '1bw #red, 2bw dashed #blue end',
      }),
    ).toEqual({
      'border-block-start': '1px solid var(--red-color)',
      'border-block-end': '2px dashed var(--blue-color)',
    });
    expect(logicalStyleHandlers.inlineBorder({ inlineBorder: true })).toEqual({
      'border-inline': '1px solid var(--border-color, currentColor)',
    });
  });

  it('uses one size handler for the main, min, and max declarations', () => {
    expect(
      blockSizeStyle({
        blockSize: '1x 5x 10x',
        minBlockSize: '2x',
        maxBlockSize: '20x',
      }),
    ).toEqual({
      'min-block-size': '16px',
      'block-size': '40px',
      'max-block-size': '160px',
    });
    expect(
      inlineSizeStyle({
        inlineSize: 'fixed 12x',
        maxInlineSize: '20x',
      }),
    ).toEqual({
      'min-inline-size': '96px',
      'inline-size': '96px',
      'max-inline-size': '160px',
    });
  });

  it('renders size constraints in one rule with explicit overrides', () => {
    const { rules } = renderStyles({
      blockSize: '1x 5x 10x',
      minBlockSize: '2x',
      maxBlockSize: '20x',
    });

    expect(rules.map((rule) => rule.declarations)).toEqual([
      'block-size: 40px; min-block-size: 16px; max-block-size: 160px;',
    ]);
  });

  it('keeps state maps independent between logical categories', () => {
    const { rules } = renderStyles({
      blockPadding: { '': '1x', hovered: '2x' },
      inlinePadding: { '': '3x', pressed: '4x' },
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

  it('keeps native logical longhands as ordinary CSS properties', () => {
    const { rules } = renderStyles({
      paddingInlineStart: '1x',
      borderStartStartRadius: '2r',
    });
    const declarations = rules.map((rule) => rule.declarations);

    expect(declarations).toContain('padding-inline-start: 8px;');
    expect(declarations).toContain('border-start-start-radius: 12px;');
  });
});
