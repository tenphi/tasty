import { getColorSpaceFunc, getColorSpaceSuffix } from './color-space';

export function color(name: string, opacity = 1) {
  if (opacity !== 1) {
    return `${getColorSpaceFunc()}(var(--${name}-color-${getColorSpaceSuffix()}) / ${opacity})`;
  }

  return `var(--${name}-color)`;
}
