import { overrideColorAlpha } from './color-space';

export function color(name: string, opacity = 1) {
  if (opacity !== 1) {
    // The alpha slot takes a `<number>`, so the value goes in as authored —
    // no percentage conversion to introduce a float artifact.
    return overrideColorAlpha(`var(--${name}-color)`, String(opacity));
  }

  return `var(--${name}-color)`;
}
