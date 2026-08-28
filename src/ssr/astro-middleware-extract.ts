/**
 * Prerender-extraction middleware entrypoint with island cache transfer.
 * Exported only so Astro can resolve it through the package exports map.
 */

import { tastyMiddleware } from './astro';

const options = {
  transferCache: true,
  extractionMetadata: true,
};

export const onRequest = tastyMiddleware(options);
