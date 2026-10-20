/**
 * React-free configuration for the programmatic zero-runtime API.
 *
 * The main entry's `configure()` also sets up the browser injector and the
 * React runtime around it; a build script that only turns styles into CSS
 * needs neither, nor `react` installed.
 */

import {
  DEFAULT_ZERO_NAME_PREFIX,
  validateNamePrefix,
} from '../utils/name-prefix';

import type { TastyZeroConfig } from './babel-types';
import { configureZero, resetZeroConfig, setActiveZeroConfig } from './config';
import { setExtractorNamePrefix } from './extractor';

/**
 * Configure `extractStylesForSelector()` and `extractStylesWithChunks()`.
 *
 * Takes the build-time subset of the main `configure()` options. Those that
 * shape generated CSS apply: `states`, `units`, parse `functions`, `handlers`,
 * `replaceTokens`, `recipes`, `plugins`, `namePrefix` (default `'ts'`).
 * Configured `keyframes` are emitted by `extractStylesForSelector()`, with the
 * rules that animate them; `extractStylesWithChunks()` returns class rules
 * only. Each call replaces the previous configuration.
 *
 * `tokens`, `globalStyles`, `fontFaces`, `counterStyles`, `properties` and
 * `$$` `@function` definitions are not emitted with the rules; render tokens
 * and global styles with `extractStylesForSelector(':root', tokens)` and
 * `extractStylesForSelector(selector, styles)`, and the `@property` rules
 * (Tasty's defaults plus `properties`) with `extractConfigProperties()`.
 *
 * The configuration is process-wide, shared with the Babel plugin and with
 * the runtime `configure()` from `@tenphi/tasty`. The extractors re-apply it
 * after the Babel plugin replaced it, but not after a runtime `configure()`:
 * don't mix the runtime and build-time configuration in one process.
 *
 * @example
 * ```ts
 * import { configure, extractStylesForSelector } from '@tenphi/tasty/zero';
 *
 * configure({ units: { x: 'var(--gap)' } });
 * extractStylesForSelector('.card', { padding: '2x' }).css;
 * ```
 */
export function configure(config: TastyZeroConfig = {}): void {
  // Validated before anything is reset, so a rejected prefix changes nothing.
  const namePrefix = config.namePrefix ?? DEFAULT_ZERO_NAME_PREFIX;
  validateNamePrefix(namePrefix);

  resetZeroConfig();

  const resolved = configureZero({ ...config, namePrefix });
  setExtractorNamePrefix(namePrefix);
  setActiveZeroConfig(resolved);
}

/**
 * Drop the configuration set by `configure()`, returning the extractors to
 * their defaults.
 */
export function resetConfig(): void {
  resetZeroConfig();
  setActiveZeroConfig(null);
  setExtractorNamePrefix(DEFAULT_ZERO_NAME_PREFIX);
}
