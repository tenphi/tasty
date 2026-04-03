import { processDirectionalStyle } from './directional';

const PADDING_CONFIG = {
  property: 'padding',
  defaultValue: 'var(--gap)',
  trueValue: '1x',
  defaultInit: '0',
} as const;

export function paddingStyle({
  padding,
  paddingBlock,
  paddingInline,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
}: {
  padding?: string | number | boolean;
  paddingBlock?: string | number | boolean;
  paddingInline?: string | number | boolean;
  paddingTop?: string | number | boolean;
  paddingRight?: string | number | boolean;
  paddingBottom?: string | number | boolean;
  paddingLeft?: string | number | boolean;
}) {
  return processDirectionalStyle(PADDING_CONFIG, {
    main: padding,
    block: paddingBlock,
    inline: paddingInline,
    top: paddingTop,
    right: paddingRight,
    bottom: paddingBottom,
    left: paddingLeft,
  });
}

paddingStyle.__lookupStyles = [
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
];
