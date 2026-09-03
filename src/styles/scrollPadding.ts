import { processDirectionalStyle } from './directional';

const SCROLL_PADDING_CONFIG = {
  property: 'scroll-padding',
  defaultValue: '0',
  trueValue: '1x',
  defaultInit: '0',
} as const;

export function scrollPaddingStyle({
  scrollPadding,
  scrollPaddingTop,
  scrollPaddingRight,
  scrollPaddingBottom,
  scrollPaddingLeft,
}: {
  scrollPadding?: string | number | boolean;
  scrollPaddingTop?: string | number | boolean;
  scrollPaddingRight?: string | number | boolean;
  scrollPaddingBottom?: string | number | boolean;
  scrollPaddingLeft?: string | number | boolean;
}) {
  return processDirectionalStyle(SCROLL_PADDING_CONFIG, {
    main: scrollPadding,
    top: scrollPaddingTop,
    right: scrollPaddingRight,
    bottom: scrollPaddingBottom,
    left: scrollPaddingLeft,
  });
}

scrollPaddingStyle.__lookupStyles = [
  'scrollPadding',
  'scrollPaddingTop',
  'scrollPaddingRight',
  'scrollPaddingBottom',
  'scrollPaddingLeft',
];
