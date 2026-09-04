import { bench, describe } from 'vitest';

import { modAttrs } from './mod-attrs';

const stableMods = { active: true, size: 'large', disabled: false };
const equivalentMods = Array.from({ length: 1000 }, () => ({
  active: true,
  size: 'large',
  disabled: false,
}));
const variedMods = Array.from({ length: 1000 }, (_, index) => ({
  active: index % 2 === 0,
  level: index,
  size: `size-${index}`,
}));
let index = 0;

modAttrs(stableMods);

describe('modAttrs', () => {
  bench('stable modifier map', () => {
    modAttrs(stableMods);
  });

  bench('equivalent modifier maps', () => {
    modAttrs(equivalentMods[index++ % equivalentMods.length]);
  });

  bench('varied modifier maps', () => {
    modAttrs(variedMods[index++ % variedMods.length]);
  });
});
