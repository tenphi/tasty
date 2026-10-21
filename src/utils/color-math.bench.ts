import { test } from 'vitest';

import { okhslToSrgb } from './color-math';

const COLORS = Array.from(
  { length: 2048 },
  (_, i) =>
    [(i * 137.508) % 360, (i % 101) / 100, ((i * 17) % 101) / 100] as const,
);

let index = 0;

test('color math', async ({ bench }) => {
  await bench('OKHSL to sRGB', () => {
    const [h, s, l] = COLORS[index++ & (COLORS.length - 1)];
    okhslToSrgb(h, s, l);
  }).run();
});
