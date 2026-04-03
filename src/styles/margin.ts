import { processDirectionalStyle } from './directional';

const MARGIN_CONFIG = {
  property: 'margin',
  defaultValue: 'var(--gap)',
  trueValue: '1x',
  defaultInit: '0',
} as const;

export function marginStyle({
  margin,
  marginBlock,
  marginInline,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
}: {
  margin?: string | number | boolean;
  marginBlock?: string | number | boolean;
  marginInline?: string | number | boolean;
  marginTop?: string | number | boolean;
  marginRight?: string | number | boolean;
  marginBottom?: string | number | boolean;
  marginLeft?: string | number | boolean;
}) {
  return processDirectionalStyle(MARGIN_CONFIG, {
    main: margin,
    block: marginBlock,
    inline: marginInline,
    top: marginTop,
    right: marginRight,
    bottom: marginBottom,
    left: marginLeft,
  });
}

marginStyle.__lookupStyles = [
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
];
