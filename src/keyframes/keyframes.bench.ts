import { bench, describe } from 'vitest';

import type { Styles } from '../styles/types';

import {
  extractAnimationNamesFromStyles,
  replaceAnimationNames,
} from './index';

const styles: Styles = {
  animation: {
    '': 'fadeIn 300ms ease-in',
    hovered: 'pulse 1s infinite, slide 2s ease-out',
  },
  animationName: {
    '': 'spin',
    '@media(w < 800px)': 'fadeIn',
  },
  Label: {
    animation: {
      '': 'labelIn 200ms both',
      disabled: 'none',
    },
    Content: { animation: 'nested 1s steps(4) reverse' },
  },
  Icon: { animationName: 'iconPulse' },
};

const declarations =
  'padding:10px;animation:fadeIn 1s ease-in,slide 2s;' +
  'animation-name:pulse,iconPulse;color:red;';
const names = new Map([
  ['fadeIn', 'fadeIn-a1'],
  ['slide', 'slide-b2'],
  ['pulse', 'pulse-c3'],
  ['iconPulse', 'iconPulse-d4'],
  ['unused', 'unused-e5'],
]);

describe('local keyframes', () => {
  bench('discover animation names', () => {
    extractAnimationNamesFromStyles(styles);
  });

  bench('rewrite and collect animation names', () => {
    replaceAnimationNames(declarations, names, new Set());
  });
});
