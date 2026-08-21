import { mixColorAlpha } from './color-space';

export function color(name: string, opacity = 1) {
  if (opacity !== 1) {
    // `opacity * 100` is not exact for every input (0.07 lands on
    // 7.000000000000001), and the artifact would be emitted verbatim.
    const percentage = parseFloat((opacity * 100).toPrecision(12));

    return mixColorAlpha(`var(--${name}-color)`, `${percentage}%`);
  }

  return `var(--${name}-color)`;
}
