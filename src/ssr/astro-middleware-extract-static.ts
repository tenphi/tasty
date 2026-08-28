/**
 * Prerender-extraction middleware entrypoint for sites without islands.
 * Exported only so Astro can resolve it through the package exports map.
 */

import { tastyMiddleware } from './astro';

const options = {
  transferCache: false,
  extractionMetadata: true,
};

export const onRequest = tastyMiddleware(options);
