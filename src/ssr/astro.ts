/**
 * Astro integration for Tasty SSR.
 *
 * Provides tastyMiddleware() for Astro's middleware system.
 * The middleware wraps request handling in a ServerStyleCollector
 * via AsyncLocalStorage, then injects collected CSS into </head>.
 *
 * Import from '@tenphi/tasty/ssr/astro'.
 */

import { getConfig } from '../config';
import { getSSRCollector, runWithCollector } from './async-storage';
import { ServerStyleCollector } from './collector';
import { hydrateTastyCache } from './hydrate';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

// Wire up ALS-based collector discovery so useStyles can find
// the collector set by tastyMiddleware's runWithCollector().
registerSSRCollectorGetter(getSSRCollector);

// Re-export for convenience
export { hydrateTastyCache };

export interface TastyMiddlewareOptions {
  /**
   * Whether to embed the cache state script for client hydration.
   * Set to false to skip cache transfer. Default: true.
   */
  transferCache?: boolean;
}

/**
 * Create an Astro middleware that collects Tasty styles during SSR.
 *
 * All React components rendered during the request (both static
 * and islands) will have their useStyles() calls captured by the
 * collector via AsyncLocalStorage. After rendering, the middleware
 * injects the collected CSS into </head>.
 *
 * @example
 * ```ts
 * // src/middleware.ts
 * import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';
 * export const onRequest = tastyMiddleware();
 * ```
 */
export function tastyMiddleware(options?: TastyMiddlewareOptions) {
  const { transferCache = true } = options ?? {};

  return async (
    _context: unknown,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const collector = new ServerStyleCollector();

    const response = await runWithCollector(collector, () => next());

    const css = collector.getCSS();
    if (!css) return response;

    const nonce = getConfig().nonce;
    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
    const html = await response.text();
    const styleTag = `<style data-tasty-ssr${nonceAttr}>${css}</style>`;

    let cacheTag = '';
    if (transferCache) {
      const cacheState = collector.getCacheState();
      const hasHydratableStyles =
        Object.keys(cacheState.entries).length > 0;
      if (hasHydratableStyles) {
        cacheTag = `<script data-tasty-cache type="application/json"${nonceAttr}>${JSON.stringify(cacheState)}</script>`;
      }
    }

    const modifiedHtml = html.replace(
      '</head>',
      `${styleTag}${cacheTag}</head>`,
    );

    return new Response(modifiedHtml, {
      status: response.status,
      headers: response.headers,
    });
  };
}

// Client-side auto-hydration.
// When imported in the browser, reads the cache state from the DOM
// and pre-populates the injector before any island hydrates.
if (typeof window !== 'undefined') {
  const script = document.querySelector('script[data-tasty-cache]');
  if (script) {
    try {
      const state = JSON.parse(script.textContent!);
      hydrateTastyCache(state);
    } catch {
      // Ignore malformed cache state
    }
  }
}
