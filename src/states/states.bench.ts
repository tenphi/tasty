import { bench, describe } from 'vitest';

import type { Styles } from '../styles/types';
import {
  expandDimensionShorthands,
  extractLocalPredefinedStates,
  extractPredefinedStateRefs,
} from './index';

const POOL_SIZE = 6000;
let index = 0;

const dimensionQueries = Array.from(
  { length: POOL_SIZE },
  (_, i) => `${600 + i}px <= w < ${1200 + i}px and h > 40x`,
);
const stateExpressions = Array.from(
  { length: POOL_SIZE },
  (_, i) => `@mobile-${i} & @dark | @compact & !@starting`,
);
const styles = Array.from(
  { length: POOL_SIZE },
  (_, i) =>
    ({
      display: 'flex',
      padding: `${i}px`,
      fill: '#surface',
      '@mobile': `@media(w < ${600 + i}px)`,
    }) as Styles,
);

describe('advanced state helpers', () => {
  bench('expand dimension shorthands', () => {
    expandDimensionShorthands(dimensionQueries[index++ % POOL_SIZE]);
  });

  bench('extract predefined state references', () => {
    extractPredefinedStateRefs(stateExpressions[index++ % POOL_SIZE]);
  });

  bench('extract local predefined states (cold)', () => {
    extractLocalPredefinedStates({
      ...(styles[index++ % POOL_SIZE] as Record<string, unknown>),
    } as Styles);
  });
});
