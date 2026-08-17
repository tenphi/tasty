import { getColorSpaceSuffix } from '../utils/color-space';
import { parseColor, resolveCustomProperties } from '../utils/styles';

import { convertColorChainToComponentChain } from './createStyle';

export function colorStyle({ color }: { color?: string | boolean }) {
  if (!color) return null;

  if (color === true) color = 'currentColor';

  if (
    typeof color === 'string' &&
    (color.startsWith('#') || color.startsWith('(#'))
  ) {
    color = parseColor(color).color || color;
  } else if (typeof color === 'string') {
    // Non-token values are emitted verbatim, so `$name` references still need
    // substituting — otherwise the raw DSL leaks into the declaration.
    color = resolveCustomProperties(color);
  }

  const match = color.match(/var\(--(.+?)-color/);
  let name = '';

  if (match) {
    name = match[1];
  }

  const styles = {
    color: color,
  };

  if (name && name !== 'current') {
    const suffix = getColorSpaceSuffix();
    Object.assign(styles, {
      '--current-color': color,
      [`--current-color-${suffix}`]: convertColorChainToComponentChain(color),
    });
  }

  return styles;
}

colorStyle.__lookupStyles = ['color'];
