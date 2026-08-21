import {
  convertColorChainToComponentChain,
  getColorSpaceSuffix,
} from '../utils/color-space';
import { parseColor, resolveCustomProperties } from '../utils/styles';

export function colorStyle({ color }: { color?: string | boolean }) {
  if (!color) return null;

  if (color === true) color = 'currentColor';

  // Resolve whatever the parser recognizes as a color — a `#token`, a fallback
  // chain, a color function with tokens inside it. Anything else (a keyword, a
  // bare `$name`) is emitted verbatim, so references still need substituting or
  // the raw DSL leaks into the declaration.
  color = parseColor(color, true).color || resolveCustomProperties(color);

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
