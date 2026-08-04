/**
 * Internal shared CSSWriter cache for the zero-runtime Babel plugin.
 *
 * Kept in a separate non-exported module so `clearWriterCache` is not part
 * of the public `@tenphi/tasty/babel-plugin` entry surface. The Babel plugin
 * and its tests import from here directly.
 */

import type { CSSWriter } from './css-writer';
import type { Styles } from '../styles/types';
import type { TastyZeroConfig } from './babel-types';

/**
 * Registry of static styles keyed by their source identifier.
 * Used to resolve base styles when extending.
 */
export type StaticStyleRegistry = Record<
  string,
  {
    styles: Styles;
    className: string;
  }
>;

export interface WriterCacheEntry {
  writer: CSSWriter;
  configKey: string;
  registry: StaticStyleRegistry;
  config: TastyZeroConfig;
}

export const writerCache = new Map<string, WriterCacheEntry>();

/** Clear the shared CSSWriter cache. Exposed for testing. */
export function clearWriterCache(): void {
  writerCache.clear();
}
