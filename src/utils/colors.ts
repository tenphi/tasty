import { alphaToPercentage, mixColorAlpha } from './color-space';

export function color(name: string, opacity = 1) {
  if (opacity !== 1) {
    return mixColorAlpha(`var(--${name}-color)`, alphaToPercentage(opacity));
  }

  return `var(--${name}-color)`;
}
