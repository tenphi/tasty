import { processDirectionalStyle } from './directional';

const SCROLL_MARGIN_CONFIG = {
  property: 'scroll-margin',
  defaultValue: '0',
  trueValue: '1x',
  defaultInit: '0',
} as const;

export function scrollMarginStyle({
  scrollMargin,
  scrollMarginBlock,
  scrollMarginInline,
  scrollMarginTop,
  scrollMarginRight,
  scrollMarginBottom,
  scrollMarginLeft,
}: {
  scrollMargin?: string | number | boolean;
  scrollMarginBlock?: string | number | boolean;
  scrollMarginInline?: string | number | boolean;
  scrollMarginTop?: string | number | boolean;
  scrollMarginRight?: string | number | boolean;
  scrollMarginBottom?: string | number | boolean;
  scrollMarginLeft?: string | number | boolean;
}) {
  return processDirectionalStyle(SCROLL_MARGIN_CONFIG, {
    main: scrollMargin,
    block: scrollMarginBlock,
    inline: scrollMarginInline,
    top: scrollMarginTop,
    right: scrollMarginRight,
    bottom: scrollMarginBottom,
    left: scrollMarginLeft,
  });
}

scrollMarginStyle.__lookupStyles = [
  'scrollMargin',
  'scrollMarginTop',
  'scrollMarginRight',
  'scrollMarginBottom',
  'scrollMarginLeft',
  'scrollMarginBlock',
  'scrollMarginInline',
];
