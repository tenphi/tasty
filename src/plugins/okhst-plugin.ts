/**
 * OKHST Plugin for Tasty
 *
 * Converts OKHST color syntax to RGB notation.
 * OKHST is OKHSL with the lightness axis replaced by a contrast-uniform tone axis.
 * Supports angle units: deg, turn, rad, or unitless (degrees).
 *
 * Examples:
 *   okhst(240.5 50% 50%)
 *   okhst(240.5deg 50% 50%)
 *   okhst(0.25turn 50% 50%)
 *   okhst(1.57rad 50% 50%)
 */

import { okhstToSrgb } from '../utils/color-math';

import { createColorFunc } from './color-func';

import type { TastyPlugin, TastyPluginFactory } from './types';

/**
 * The okhst function handler for tasty parser.
 * Receives parsed style groups and returns an RGB color string.
 */
const okhstFunc = createColorFunc('okhst', 'H S T', okhstToSrgb);

/**
 * OKHST Plugin for Tasty.
 *
 * Adds support for the `okhst()` color function in tasty styles.
 *
 * @example
 * ```ts
 * import { configure } from '@tenphi/tasty';
 * import { okhstPlugin } from '@tenphi/tasty';
 *
 * configure({
 *   plugins: [okhstPlugin()],
 * });
 *
 * // Now you can use okhst in styles:
 * const Box = tasty({
 *   styles: {
 *     fill: 'okhst(240 50% 50%)',
 *   },
 * });
 * ```
 */
export const okhstPlugin: TastyPluginFactory = (): TastyPlugin => ({
  name: 'okhst',
  functions: {
    okhst: okhstFunc,
  },
});

export { okhstFunc };
