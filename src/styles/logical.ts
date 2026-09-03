import { parseStyle } from '../utils/styles';
import type { StyleHandler, StyleValue } from '../utils/styles';
import { parseBorderValue } from './border';

type LogicalValue = string | number | boolean | undefined;

/** Create one independent handler for one native logical declaration. */
function logicalValueStyle<const Name extends string>(
  styleName: Name,
  cssProperty: string,
  trueValue: string,
): StyleHandler<Partial<Record<Name, LogicalValue>>> {
  const handler = ((styles: Partial<Record<Name, LogicalValue>>) => {
    let value = styles[styleName];

    if (value == null || value === false || value === '') return null;
    if (value === true) value = trueValue;
    if (typeof value === 'number') value = `${value}px`;

    return { [cssProperty]: parseStyle(value as StyleValue).output };
  }) as StyleHandler<Partial<Record<Name, LogicalValue>>>;

  handler.__lookupStyles = [styleName];
  return handler;
}

/** Create one independent handler for a logical border shorthand. */
function logicalBorderStyle<const Name extends string>(
  styleName: Name,
  cssProperty: string,
): StyleHandler<Partial<Record<Name, LogicalValue>>> {
  const handler = ((styles: Partial<Record<Name, LogicalValue>>) => {
    const value = styles[styleName];
    if (value == null) return null;

    const parsed = parseBorderValue(value);
    return parsed == null ? null : { [cssProperty]: parsed };
  }) as StyleHandler<Partial<Record<Name, LogicalValue>>>;

  handler.__lookupStyles = [styleName];
  return handler;
}

/**
 * Native logical declarations deliberately stay independent. Physical and
 * logical properties participate in the CSS cascade together, so combining
 * them in a handler would incorrectly resolve writing-mode-dependent edges at
 * style-generation time.
 */
export const logicalStyleHandlers = {
  minBlockSize: logicalValueStyle('minBlockSize', 'min-block-size', 'initial'),
  maxBlockSize: logicalValueStyle('maxBlockSize', 'max-block-size', 'initial'),
  minInlineSize: logicalValueStyle(
    'minInlineSize',
    'min-inline-size',
    'initial',
  ),
  maxInlineSize: logicalValueStyle(
    'maxInlineSize',
    'max-inline-size',
    'initial',
  ),

  paddingBlock: logicalValueStyle('paddingBlock', 'padding-block', '1x'),
  paddingBlockStart: logicalValueStyle(
    'paddingBlockStart',
    'padding-block-start',
    '1x',
  ),
  paddingBlockEnd: logicalValueStyle(
    'paddingBlockEnd',
    'padding-block-end',
    '1x',
  ),
  paddingInline: logicalValueStyle('paddingInline', 'padding-inline', '1x'),
  paddingInlineStart: logicalValueStyle(
    'paddingInlineStart',
    'padding-inline-start',
    '1x',
  ),
  paddingInlineEnd: logicalValueStyle(
    'paddingInlineEnd',
    'padding-inline-end',
    '1x',
  ),

  marginBlock: logicalValueStyle('marginBlock', 'margin-block', '1x'),
  marginBlockStart: logicalValueStyle(
    'marginBlockStart',
    'margin-block-start',
    '1x',
  ),
  marginBlockEnd: logicalValueStyle('marginBlockEnd', 'margin-block-end', '1x'),
  marginInline: logicalValueStyle('marginInline', 'margin-inline', '1x'),
  marginInlineStart: logicalValueStyle(
    'marginInlineStart',
    'margin-inline-start',
    '1x',
  ),
  marginInlineEnd: logicalValueStyle(
    'marginInlineEnd',
    'margin-inline-end',
    '1x',
  ),

  insetBlock: logicalValueStyle('insetBlock', 'inset-block', '0'),
  insetBlockStart: logicalValueStyle(
    'insetBlockStart',
    'inset-block-start',
    '0',
  ),
  insetBlockEnd: logicalValueStyle('insetBlockEnd', 'inset-block-end', '0'),
  insetInline: logicalValueStyle('insetInline', 'inset-inline', '0'),
  insetInlineStart: logicalValueStyle(
    'insetInlineStart',
    'inset-inline-start',
    '0',
  ),
  insetInlineEnd: logicalValueStyle('insetInlineEnd', 'inset-inline-end', '0'),

  scrollMarginBlock: logicalValueStyle(
    'scrollMarginBlock',
    'scroll-margin-block',
    '1x',
  ),
  scrollMarginBlockStart: logicalValueStyle(
    'scrollMarginBlockStart',
    'scroll-margin-block-start',
    '1x',
  ),
  scrollMarginBlockEnd: logicalValueStyle(
    'scrollMarginBlockEnd',
    'scroll-margin-block-end',
    '1x',
  ),
  scrollMarginInline: logicalValueStyle(
    'scrollMarginInline',
    'scroll-margin-inline',
    '1x',
  ),
  scrollMarginInlineStart: logicalValueStyle(
    'scrollMarginInlineStart',
    'scroll-margin-inline-start',
    '1x',
  ),
  scrollMarginInlineEnd: logicalValueStyle(
    'scrollMarginInlineEnd',
    'scroll-margin-inline-end',
    '1x',
  ),

  scrollPaddingBlock: logicalValueStyle(
    'scrollPaddingBlock',
    'scroll-padding-block',
    '1x',
  ),
  scrollPaddingBlockStart: logicalValueStyle(
    'scrollPaddingBlockStart',
    'scroll-padding-block-start',
    '1x',
  ),
  scrollPaddingBlockEnd: logicalValueStyle(
    'scrollPaddingBlockEnd',
    'scroll-padding-block-end',
    '1x',
  ),
  scrollPaddingInline: logicalValueStyle(
    'scrollPaddingInline',
    'scroll-padding-inline',
    '1x',
  ),
  scrollPaddingInlineStart: logicalValueStyle(
    'scrollPaddingInlineStart',
    'scroll-padding-inline-start',
    '1x',
  ),
  scrollPaddingInlineEnd: logicalValueStyle(
    'scrollPaddingInlineEnd',
    'scroll-padding-inline-end',
    '1x',
  ),

  borderBlock: logicalBorderStyle('borderBlock', 'border-block'),
  borderBlockStart: logicalBorderStyle(
    'borderBlockStart',
    'border-block-start',
  ),
  borderBlockEnd: logicalBorderStyle('borderBlockEnd', 'border-block-end'),
  borderInline: logicalBorderStyle('borderInline', 'border-inline'),
  borderInlineStart: logicalBorderStyle(
    'borderInlineStart',
    'border-inline-start',
  ),
  borderInlineEnd: logicalBorderStyle('borderInlineEnd', 'border-inline-end'),

  borderBlockWidth: logicalValueStyle(
    'borderBlockWidth',
    'border-block-width',
    '1bw',
  ),
  borderBlockStyle: logicalValueStyle(
    'borderBlockStyle',
    'border-block-style',
    'solid',
  ),
  borderBlockColor: logicalValueStyle(
    'borderBlockColor',
    'border-block-color',
    'var(--border-color, currentColor)',
  ),
  borderInlineWidth: logicalValueStyle(
    'borderInlineWidth',
    'border-inline-width',
    '1bw',
  ),
  borderInlineStyle: logicalValueStyle(
    'borderInlineStyle',
    'border-inline-style',
    'solid',
  ),
  borderInlineColor: logicalValueStyle(
    'borderInlineColor',
    'border-inline-color',
    'var(--border-color, currentColor)',
  ),

  borderBlockStartWidth: logicalValueStyle(
    'borderBlockStartWidth',
    'border-block-start-width',
    '1bw',
  ),
  borderBlockStartStyle: logicalValueStyle(
    'borderBlockStartStyle',
    'border-block-start-style',
    'solid',
  ),
  borderBlockStartColor: logicalValueStyle(
    'borderBlockStartColor',
    'border-block-start-color',
    'var(--border-color, currentColor)',
  ),
  borderBlockEndWidth: logicalValueStyle(
    'borderBlockEndWidth',
    'border-block-end-width',
    '1bw',
  ),
  borderBlockEndStyle: logicalValueStyle(
    'borderBlockEndStyle',
    'border-block-end-style',
    'solid',
  ),
  borderBlockEndColor: logicalValueStyle(
    'borderBlockEndColor',
    'border-block-end-color',
    'var(--border-color, currentColor)',
  ),
  borderInlineStartWidth: logicalValueStyle(
    'borderInlineStartWidth',
    'border-inline-start-width',
    '1bw',
  ),
  borderInlineStartStyle: logicalValueStyle(
    'borderInlineStartStyle',
    'border-inline-start-style',
    'solid',
  ),
  borderInlineStartColor: logicalValueStyle(
    'borderInlineStartColor',
    'border-inline-start-color',
    'var(--border-color, currentColor)',
  ),
  borderInlineEndWidth: logicalValueStyle(
    'borderInlineEndWidth',
    'border-inline-end-width',
    '1bw',
  ),
  borderInlineEndStyle: logicalValueStyle(
    'borderInlineEndStyle',
    'border-inline-end-style',
    'solid',
  ),
  borderInlineEndColor: logicalValueStyle(
    'borderInlineEndColor',
    'border-inline-end-color',
    'var(--border-color, currentColor)',
  ),

  borderStartStartRadius: logicalValueStyle(
    'borderStartStartRadius',
    'border-start-start-radius',
    '1r',
  ),
  borderStartEndRadius: logicalValueStyle(
    'borderStartEndRadius',
    'border-start-end-radius',
    '1r',
  ),
  borderEndStartRadius: logicalValueStyle(
    'borderEndStartRadius',
    'border-end-start-radius',
    '1r',
  ),
  borderEndEndRadius: logicalValueStyle(
    'borderEndEndRadius',
    'border-end-end-radius',
    '1r',
  ),
} as const;
