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

export const BASE_STYLES = [
  'display',
  'font',
  'preset',
  'hide',
  'whiteSpace',
  'opacity',
  'transition',
] as const;

export const POSITION_STYLES = [
  'gridArea',
  'order',
  'gridColumn',
  'gridRow',
  'placeSelf',
  'alignSelf',
  'justifySelf',
  'zIndex',
  'margin',
  ...LOGICAL_MARGIN_STYLES,
  'inset',
  ...LOGICAL_INSET_STYLES,
  'position',
  'scrollMargin',
  ...LOGICAL_SCROLL_MARGIN_STYLES,
  'scrollPadding',
  ...LOGICAL_SCROLL_PADDING_STYLES,
] as const;

export const BLOCK_INNER_STYLES = [
  'padding',
  ...LOGICAL_PADDING_STYLES,
  'overflow',
  'scrollbar',
  'textAlign',
] as const;

export const BLOCK_OUTER_STYLES = [
  'border',
  ...LOGICAL_BORDER_STYLES,
  'radius',
  ...LOGICAL_RADIUS_STYLES,
  'shadow',
  'outline',
] as const;

export const BLOCK_STYLES = [
  ...BLOCK_INNER_STYLES,
  ...BLOCK_OUTER_STYLES,
] as const;

export const COLOR_STYLES = ['color', 'fill', 'fade', 'image'] as const;

export const TEXT_STYLES = [
  'textTransform',
  'fontWeight',
  'fontStyle',
] as const;

export const DIMENSION_STYLES = [
  'width',
  'height',
  ...LOGICAL_SIZE_STYLES,
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'flex',
] as const;

export const FLOW_STYLES = [
  'flow',
  'place',
  'placeItems',
  'placeContent',
  'alignItems',
  'alignContent',
  'justifyItems',
  'justifyContent',
  'align',
  'justify',
  'gap',
  'columnGap',
  'rowGap',
  'gridColumns',
  'gridRows',
  'gridTemplate',
  'gridAreas',
] as const;

export const CONTAINER_STYLES = [
  ...BASE_STYLES,
  ...COLOR_STYLES,
  ...DIMENSION_STYLES,
  ...POSITION_STYLES,
  ...BLOCK_STYLES,
  ...FLOW_STYLES,
] as const;

export const OUTER_STYLES = [
  ...POSITION_STYLES,
  ...DIMENSION_STYLES,
  ...BLOCK_OUTER_STYLES,
] as const;

export const INNER_STYLES = [
  ...BASE_STYLES,
  ...COLOR_STYLES,
  ...BLOCK_INNER_STYLES,
  ...FLOW_STYLES,
] as const;
