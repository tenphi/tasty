/** Data-only logical property families shared by public style lists and chunks. */

export const LOGICAL_SIZE_STYLES = [
  'blockSize',
  'minBlockSize',
  'maxBlockSize',
  'inlineSize',
  'minInlineSize',
  'maxInlineSize',
] as const;

export const LOGICAL_PADDING_STYLES = [
  'paddingBlock',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInline',
  'paddingInlineStart',
  'paddingInlineEnd',
] as const;

export const LOGICAL_MARGIN_STYLES = [
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
] as const;

export const LOGICAL_INSET_STYLES = [
  'insetBlock',
  'insetBlockStart',
  'insetBlockEnd',
  'insetInline',
  'insetInlineStart',
  'insetInlineEnd',
] as const;

export const LOGICAL_SCROLL_MARGIN_STYLES = [
  'scrollMarginBlock',
  'scrollMarginBlockStart',
  'scrollMarginBlockEnd',
  'scrollMarginInline',
  'scrollMarginInlineStart',
  'scrollMarginInlineEnd',
] as const;

export const LOGICAL_SCROLL_PADDING_STYLES = [
  'scrollPaddingBlock',
  'scrollPaddingBlockStart',
  'scrollPaddingBlockEnd',
  'scrollPaddingInline',
  'scrollPaddingInlineStart',
  'scrollPaddingInlineEnd',
] as const;

export const LOGICAL_BORDER_STYLES = [
  'borderBlock',
  'borderBlockStart',
  'borderBlockEnd',
  'borderInline',
  'borderInlineStart',
  'borderInlineEnd',
  'borderBlockWidth',
  'borderBlockStyle',
  'borderBlockColor',
  'borderInlineWidth',
  'borderInlineStyle',
  'borderInlineColor',
  'borderBlockStartWidth',
  'borderBlockStartStyle',
  'borderBlockStartColor',
  'borderBlockEndWidth',
  'borderBlockEndStyle',
  'borderBlockEndColor',
  'borderInlineStartWidth',
  'borderInlineStartStyle',
  'borderInlineStartColor',
  'borderInlineEndWidth',
  'borderInlineEndStyle',
  'borderInlineEndColor',
] as const;

export const LOGICAL_RADIUS_STYLES = [
  'borderStartStartRadius',
  'borderStartEndRadius',
  'borderEndStartRadius',
  'borderEndEndRadius',
] as const;
