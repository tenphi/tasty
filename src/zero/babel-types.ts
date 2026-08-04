/**
 * Shared zero-runtime types.
 *
 * Extracted from `babel.ts` so internal helpers (e.g. the writer cache) can
 * reference `TastyZeroConfig` without a circular import on the Babel plugin
 * entry module.
 */

import type { TastyConfig } from '../config';

/**
 * Build-time configuration for zero-runtime mode.
 * Subset of TastyConfig excluding runtime-only DOM options
 * (`nonce`, `maxRulesPerSheet`, `forceTextInjection`, `gc`)
 * and overriding `devMode` default to `false`.
 */
export type TastyZeroConfig = Omit<
  TastyConfig,
  'nonce' | 'maxRulesPerSheet' | 'forceTextInjection' | 'gc' | 'devMode'
> & {
  /**
   * Enable development mode features: source comments in generated CSS.
   * @default false
   */
  devMode?: boolean;
};
