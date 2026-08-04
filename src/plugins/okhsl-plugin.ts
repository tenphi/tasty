/**
 * OKHSL Plugin for Tasty
 *
 * Converts OKHSL color syntax to RGB notation.
 * Supports angle units: deg, turn, rad, or unitless (degrees).
 *
 * Examples:
 *   okhsl(240.5 50% 50%)
 *   okhsl(240.5deg 50% 50%)
 *   okhsl(0.25turn 50% 50%)
 *   okhsl(1.57rad 50% 50%)
 */

import { okhslToSrgb } from '../utils/color-math';

import { createColorFunc } from './color-func';

import type { TastyPlugin, TastyPluginFactory } from './types';

/**
 * The okhsl function handler for tasty parser.
 * Receives parsed style groups and returns an RGB color string.
 */
const okhslFunction = createColorFunc('okhsl', okhslToSrgb, 'H S L');

/**
 * OKHSL Plugin for Tasty.
 *
 * Adds support for the `okhsl()` color function in tasty styles.
 *
 * @example
 * ```ts
 * import { configure } from '@tenphi/tasty';
 * import { okhslPlugin } from '@tenphi/tasty';
 *
 * configure({
 *   plugins: [okhslPlugin()],
 * });
 *
 * // Now you can use okhsl in styles:
 * const Box = tasty({
 *   styles: {
 *     fill: 'okhsl(240 50% 50%)',
 *   },
 * });
 * ```
 */
export const okhslPlugin: TastyPluginFactory = (): TastyPlugin => ({
  name: 'okhsl',
  functions: {
    okhsl: okhslFunction,
  },
});

export { okhslFunction };
