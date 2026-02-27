/**
 * Tasty Plugins
 *
 * This module exports official tasty plugins that extend the style system.
 *
 * @example
 * ```ts
 * import { configure } from '@tenphi/tasty';
 * import { okhslPlugin } from '@tenphi/tasty';
 *
 * configure({
 *   plugins: [okhslPlugin()],
 * });
 * ```
 */

// Types
export type { TastyPlugin, TastyPluginFactory } from './types';

// Plugins
export { okhslPlugin, okhslFunc } from './okhsl-plugin';
