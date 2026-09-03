/** Data-only logical style families shared by handlers, public lists, and chunks. */

export const BLOCK_SIZE_STYLES = [
  'blockSize',
  'minBlockSize',
  'maxBlockSize',
] as const;

export const INLINE_SIZE_STYLES = [
  'inlineSize',
  'minInlineSize',
  'maxInlineSize',
] as const;

/** Enhanced logical size categories exposed by Tasty's public style lists. */
export const LOGICAL_SIZE_STYLES = ['blockSize', 'inlineSize'] as const;

/** Every input consumed by the two logical size handlers. */
export const LOGICAL_SIZE_HANDLER_STYLES = [
  ...BLOCK_SIZE_STYLES,
  ...INLINE_SIZE_STYLES,
] as const;

export const LOGICAL_PADDING_STYLES = [
  'blockPadding',
  'inlinePadding',
] as const;

export const LOGICAL_MARGIN_STYLES = ['blockMargin', 'inlineMargin'] as const;

export const LOGICAL_INSET_STYLES = ['blockInset', 'inlineInset'] as const;

export const LOGICAL_SCROLL_MARGIN_STYLES = [
  'blockScrollMargin',
  'inlineScrollMargin',
] as const;

export const LOGICAL_SCROLL_PADDING_STYLES = [
  'blockScrollPadding',
  'inlineScrollPadding',
] as const;

export const LOGICAL_BORDER_STYLES = ['blockBorder', 'inlineBorder'] as const;
