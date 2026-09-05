import { bench, describe } from 'vitest';

import { getGlobalParser } from '../utils/styles';

import { borderStyle } from './border';
import { displayStyle } from './display';
import { fadeStyle } from './fade';
import { insetStyle } from './inset';
import { outlineStyle } from './outline';
import { paddingStyle } from './padding';
import { logicalStyleHandlers } from './logical';

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
}

describe('style handlers with cached parsing', () => {
  bench(
    'physical shorthand',
    () => {
      paddingStyle({ padding: PHYSICAL_SHORTHAND });
    },
    { setup: warmParserCache },
  );

  bench(
    'physical direction groups',
    () => {
      paddingStyle({ padding: PHYSICAL_DIRECTIONS });
    },
    { setup: warmParserCache },
  );

  bench(
    'physical individual overrides',
    () => {
      paddingStyle({
        padding: PHYSICAL_SHORTHAND,
        paddingTop: '5x',
        paddingLeft: '6x',
      });
    },
    { setup: warmParserCache },
  );

  bench(
    'logical shorthand',
    () => {
      logicalStyleHandlers.blockPadding({
        blockPadding: LOGICAL_SHORTHAND,
      });
    },
    { setup: warmParserCache },
  );

  bench(
    'logical direction groups',
    () => {
      logicalStyleHandlers.inlinePadding({
        inlinePadding: LOGICAL_DIRECTIONS,
      });
    },
    { setup: warmParserCache },
  );

  bench(
    'logical border groups',
    () => {
      logicalStyleHandlers.blockBorder({ blockBorder: LOGICAL_BORDER });
    },
    { setup: warmParserCache },
  );

  bench(
    'physical border shorthand',
    () => {
      borderStyle({ border: PHYSICAL_BORDER });
    },
    { setup: warmParserCache },
  );

  bench(
    'physical border directions',
    () => {
      borderStyle({ border: PHYSICAL_BORDER_DIRECTIONS });
    },
    { setup: warmParserCache },
  );

  bench(
    'physical border groups',
    () => {
      borderStyle({ border: PHYSICAL_BORDER_GROUPS });
    },
    { setup: warmParserCache },
  );

  bench(
    'fade direction groups',
    () => {
      fadeStyle({ fade: FADE });
    },
    {
      setup: warmParserCache,
    },
  );

  bench(
    'outline with offset',
    () => {
      outlineStyle({ outline: OUTLINE });
    },
    {
      setup: warmParserCache,
    },
  );

  bench(
    'docked inset',
    () => {
      insetStyle({ inset: DOCKED_INSET });
    },
    {
      setup: warmParserCache,
    },
  );

  bench(
    'multiline text overflow',
    () => {
      displayStyle({ textOverflow: MULTILINE_TEXT_OVERFLOW });
    },
    {
      setup: warmParserCache,
    },
  );
});
