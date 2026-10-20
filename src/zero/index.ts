/**
 * Zero-runtime module for programmatic use. Loads no React.
 *
 * For the Babel plugin, import from '@tenphi/tasty/babel-plugin'
 *
 * @example
 * ```typescript
 * import {
 *   configure,
 *   extractConfigProperties,
 *   extractStylesWithChunks,
 *   CSSWriter,
 * } from '@tenphi/tasty/zero';
 *
 * configure({ units: { x: 'var(--gap)' } });
 *
 * const writer = new CSSWriter('output.css');
 * // Tasty's default @property set, which the generated CSS reads.
 * extractConfigProperties().forEach(prop => writer.add(prop.name, prop.css));
 * const chunks = extractStylesWithChunks({ fill: '#blue', padding: '2x' });
 * chunks.forEach(chunk => writer.add(chunk.className, chunk.css));
 * writer.write();
 * ```
 */

// Configuration (React-free)
export { configure, resetConfig } from './configure';
export type { TastyZeroConfig } from './babel-types';

// Core extraction utilities
export {
  extractConfigProperties,
  extractStylesWithChunks,
  extractStylesForSelector,
} from './extractor';
export type {
  ExtractedChunk,
  ExtractedProperty,
  ExtractedSelector,
} from './extractor';

// CSS output utilities
export { CSSWriter, createCSSWriter } from './css-writer';
export type { CSSWriterOptions } from './css-writer';
