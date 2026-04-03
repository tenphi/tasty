import { type DirectionalConfig, processDirectionalStyle } from './directional';

const INSET_CONFIG: DirectionalConfig = {
  property: 'inset',
  defaultValue: '0',
  trueValue: '0',
  defaultInit: 'auto',
  individualOnly: true,
  directionProperty: (dir) => dir,
};

export function insetStyle({
  inset,
  insetBlock,
  insetInline,
  top,
  right,
  bottom,
  left,
}: {
  inset?: string | number | boolean;
  insetBlock?: string | number | boolean;
  insetInline?: string | number | boolean;
  top?: string | number | boolean;
  right?: string | number | boolean;
  bottom?: string | number | boolean;
  left?: string | number | boolean;
}) {
  return processDirectionalStyle(INSET_CONFIG, {
    main: inset,
    block: insetBlock,
    inline: insetInline,
    top,
    right,
    bottom,
    left,
  });
}

insetStyle.__lookupStyles = [
  'inset',
  'insetBlock',
  'insetInline',
  'top',
  'right',
  'bottom',
  'left',
];
