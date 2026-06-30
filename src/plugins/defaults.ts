import { customFunc } from '../utils/styles';

import { okhslFunc, okhslPlugin } from './okhsl-plugin';
import { okhstFunc, okhstPlugin } from './okhst-plugin';

import type { TastyPlugin } from './types';

/**
 * Plugins that are enabled by default so OKHSL/OKHST colors work out of the
 * box without any user configuration. They are ordinary `functions` entries —
 * the same mechanism any third-party color plugin uses — so they require no
 * special-casing in core.
 */
export const DEFAULT_PLUGINS: TastyPlugin[] = [okhslPlugin(), okhstPlugin()];

let defaultsRegistered = false;

/**
 * Register the default color functions (okhsl, okhst) with the global parser.
 *
 * Idempotent and safe to call from the lazy parser initializer so that
 * zero-config usage keeps working. `resetGlobalFuncs` re-invokes this after
 * clearing user-registered functions so the defaults survive a config reset.
 */
export function registerDefaultFunctions(): void {
  customFunc('okhsl', okhslFunc);
  customFunc('okhst', okhstFunc);
  defaultsRegistered = true;
}

/**
 * Whether the default color functions have been registered yet.
 * @internal
 */
export function areDefaultFunctionsRegistered(): boolean {
  return defaultsRegistered;
}

/** @internal */
export function _resetDefaultFunctionsFlag(): void {
  defaultsRegistered = false;
}
