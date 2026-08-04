import { customFunction } from '../utils/styles';

import { okhslFunction } from './okhsl-plugin';
import { okhstFunction } from './okhst-plugin';

/**
 * Register the default color functions (okhsl, okhst) with the global parser.
 *
 * They are ordinary `functions` entries — the same mechanism any third-party
 * color plugin uses — so they need no special-casing in core.
 *
 * Idempotent and safe to call from the lazy parser initializer so that
 * zero-config usage keeps working. `resetGlobalParseFunctions()` re-invokes it
 * after clearing user-registered functions so the defaults survive a config reset.
 *
 * @internal
 */
export function registerDefaultFunctions(): void {
  customFunction('okhsl', okhslFunction);
  customFunction('okhst', okhstFunction);
}
