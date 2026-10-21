import { test } from 'vitest';

import { getGlobalParser } from '../utils/styles';

import { borderStyle } from './border';
import { displayStyle } from './display';
import { fadeStyle } from './fade';
import { insetStyle } from './inset';
import { outlineStyle } from './outline';
import { paddingStyle } from './padding';
import { logicalStyleHandlers } from './logical';
import { transitionStyle } from './transition';

const PHYSICAL_SHORTHAND = '1x 2x 3x 4x';
const PHYSICAL_DIRECTIONS = '1x, 2x top bottom, 3x left';
const LOGICAL_SHORTHAND = '1x 2x';
const LOGICAL_DIRECTIONS = '1x, 2x start, 3x end longhand';
const LOGICAL_BORDER = '1bw solid #red, 2bw dashed #blue end';
const PHYSICAL_BORDER = '2bw dashed #purple';
const PHYSICAL_BORDER_DIRECTIONS = '2bw dashed #purple top bottom';
const PHYSICAL_BORDER_GROUPS = '1bw solid #red, 2bw dashed #blue top bottom';
const FADE = '3x top, 1x bottom';
const OUTLINE = '2ow dashed #purple / 1x';
const DOCKED_INSET = '2x 4x bottom dock';
const MULTILINE_TEXT_OVERFLOW = 'ellipsis / 3';
const TRANSITION = 'fill 200ms ease';

function warmParserCache(): void {
  const parser = getGlobalParser();
  parser.clearCache();

  paddingStyle({ padding: PHYSICAL_SHORTHAND });
  paddingStyle({ padding: PHYSICAL_DIRECTIONS });
  logicalStyleHandlers.blockPadding({
    blockPadding: LOGICAL_SHORTHAND,
  });
  logicalStyleHandlers.inlinePadding({
    inlinePadding: LOGICAL_DIRECTIONS,
  });
  logicalStyleHandlers.blockBorder({ blockBorder: LOGICAL_BORDER });
  borderStyle({ border: PHYSICAL_BORDER });
  borderStyle({ border: PHYSICAL_BORDER_DIRECTIONS });
  borderStyle({ border: PHYSICAL_BORDER_GROUPS });
  fadeStyle({ fade: FADE });
  outlineStyle({ outline: OUTLINE });
  insetStyle({ inset: DOCKED_INSET });
  displayStyle({ textOverflow: MULTILINE_TEXT_OVERFLOW });
  transitionStyle({ transition: TRANSITION });
}

test('style handlers with cached parsing', async ({ bench }) => {
  await bench.compare(
    bench('physical shorthand', { beforeAll: warmParserCache }, () => {
      paddingStyle({ padding: PHYSICAL_SHORTHAND });
    }),

    bench('physical direction groups', { beforeAll: warmParserCache }, () => {
      paddingStyle({ padding: PHYSICAL_DIRECTIONS });
    }),

    bench(
      'physical individual overrides',
      { beforeAll: warmParserCache },
      () => {
        paddingStyle({
          padding: PHYSICAL_SHORTHAND,
          paddingTop: '5x',
          paddingLeft: '6x',
        });
      },
    ),

    bench('logical shorthand', { beforeAll: warmParserCache }, () => {
      logicalStyleHandlers.blockPadding({
        blockPadding: LOGICAL_SHORTHAND,
      });
    }),

    bench('logical direction groups', { beforeAll: warmParserCache }, () => {
      logicalStyleHandlers.inlinePadding({
        inlinePadding: LOGICAL_DIRECTIONS,
      });
    }),

    bench('logical border groups', { beforeAll: warmParserCache }, () => {
      logicalStyleHandlers.blockBorder({ blockBorder: LOGICAL_BORDER });
    }),

    bench('physical border shorthand', { beforeAll: warmParserCache }, () => {
      borderStyle({ border: PHYSICAL_BORDER });
    }),

    bench('physical border directions', { beforeAll: warmParserCache }, () => {
      borderStyle({ border: PHYSICAL_BORDER_DIRECTIONS });
    }),

    bench('physical border groups', { beforeAll: warmParserCache }, () => {
      borderStyle({ border: PHYSICAL_BORDER_GROUPS });
    }),

    bench(
      'fade direction groups',
      {
        beforeAll: warmParserCache,
      },
      () => {
        fadeStyle({ fade: FADE });
      },
    ),

    bench(
      'outline with offset',
      {
        beforeAll: warmParserCache,
      },
      () => {
        outlineStyle({ outline: OUTLINE });
      },
    ),

    bench(
      'docked inset',
      {
        beforeAll: warmParserCache,
      },
      () => {
        insetStyle({ inset: DOCKED_INSET });
      },
    ),

    bench(
      'multiline text overflow',
      {
        beforeAll: warmParserCache,
      },
      () => {
        displayStyle({ textOverflow: MULTILINE_TEXT_OVERFLOW });
      },
    ),

    bench('mapped transition', { beforeAll: warmParserCache }, () => {
      transitionStyle({ transition: TRANSITION });
    }),
  );
});
