import { bench, describe } from 'vitest';

import { computeStyles } from '../compute-styles';
import type { Styles } from '../styles/types';

import { ServerStyleCollector } from './collector';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

/**
 * The server has no equivalent of the factory-level `classNameCache` in
 * tasty.tsx — it is skipped when `document` is undefined, because
 * `computeStyles()` is what feeds the per-request collector. So every render
 * of every component re-enters `computeStyles()` with the same factory styles
 * object, and re-derives the same chunk cache keys.
 *
 * That is the case `stableStyles` exists for, and this is where it is worth
 * measuring: the whole call, not just key generation.
 */
const factoryStyles = {
  display: 'flex',
  flow: 'column',
  padding: '2x',
  gap: '1x',
  fill: { '': '#surface', ':hover': '#primary', disabled: '#muted' },
  color: { '': '#text', '@root(schema=dark)': '#text-dark' },
  border: '1bw solid #border',
  radius: '1r',
  preset: 't3',
} as Styles;

const collector = new ServerStyleCollector();
registerSSRCollectorGetter(() => collector);

// The first render of a request allocates the class names; every render after
// it is a repeat, which is what a page full of one component looks like.
computeStyles(factoryStyles, { stableStyles: true });

describe('SSR repeat render of one factory', () => {
  bench('computeStyles (stable factory styles)', () => {
    computeStyles(factoryStyles, { stableStyles: true });
  });
});
