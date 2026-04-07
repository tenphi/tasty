/**
 * Astro integration for Tasty SSR.
 *
 * Provides:
 * - tastyIntegration() — Astro Integration API (recommended)
 * - tastyMiddleware()  — manual middleware for advanced composition
 *
 * Import from '@tenphi/tasty/ssr/astro'.
 */

import { getConfig } from '../config';
import { getSSRCollector, runWithCollector } from './async-storage';
import { ServerStyleCollector } from './collector';
import { hydrateTastyCache } from './hydrate';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

// Wire up ALS-based collector discovery so computeStyles() can find
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
 * All React components rendered during the request will have their
 * computeStyles() calls captured by the collector via AsyncLocalStorage.
 * After rendering, the middleware injects the collected CSS into </head>.
 *
 * @example Manual middleware setup
 * ```ts
 * // src/middleware.ts
 * import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';
 * export const onRequest = tastyMiddleware();
 * ```
 *
 * @example Composing with other middleware
 * ```ts
 * // src/middleware.ts
 * import { sequence } from 'astro:middleware';
 * import { tastyMiddleware } from '@tenphi/tasty/ssr/astro';
 *
 * export const onRequest = sequence(
 *   tastyMiddleware(),
 *   myOtherMiddleware,
 * );
 * ```
 */
export function tastyMiddleware(options?: TastyMiddlewareOptions) {
  return async (
    _context: unknown,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const transferCache = options?.transferCache ?? true;
    const collector = new ServerStyleCollector();

    const response = await runWithCollector(collector, () => next());

    const css = collector.getCSS();
    if (!css) return response;

    const nonce = getConfig().nonce;
    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
    const styleTag = `<style data-tasty-ssr${nonceAttr}>${css}</style>`;

    let cacheTag = '';
    if (transferCache) {
      const cacheState = collector.getCacheState();
      const hasHydratableStyles = Object.keys(cacheState.entries).length > 0;
      if (hasHydratableStyles) {
        cacheTag = `<script data-tasty-cache type="application/json"${nonceAttr}>${JSON.stringify(cacheState)}</script>`;
      }
    }

    const injection = styleTag + cacheTag;
    const body = response.body;

    if (!body) {
      return response;
    }

    const { readable, writable } = new TransformStream<string, string>();
    const writer = writable.getWriter();
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();

    let injected = false;
    let leftover = '';

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          if (injected) {
            await writer.write(value);
            continue;
          }

          const text = leftover + value;
          const idx = text.indexOf('</head>');

          if (idx !== -1) {
            injected = true;
            const before = text.slice(0, idx);
            const after = text.slice(idx);
            await writer.write(before + injection + after);
            leftover = '';
          } else {
            // Keep the last 6 chars in case </head> spans two chunks
            const safeLen = Math.max(0, text.length - 6);
            if (safeLen > 0) {
              await writer.write(text.slice(0, safeLen));
            }
            leftover = text.slice(safeLen);
          }
        }

        if (leftover) {
          await writer.write(leftover);
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable.pipeThrough(new TextEncoderStream()), {
      status: response.status,
      headers: response.headers,
    });
  };
}

// ============================================================================
// Module-level middleware config (set by tastyIntegration, read by
// astro-middleware.ts via getter property)
// ============================================================================

let _middlewareTransferCache = true;

/** @internal */
export function setMiddlewareTransferCache(value: boolean): void {
  _middlewareTransferCache = value;
}

/** @internal */
export function getMiddlewareTransferCache(): boolean {
  return _middlewareTransferCache;
}

// ============================================================================
// Astro Integration API
// ============================================================================

export interface TastyIntegrationOptions {
  /**
   * Enable island hydration support.
   *
   * When `true` (default): injects a client hydration script via
   * `injectScript('before-hydration')` and sets `transferCache: true`
   * on the middleware. Islands skip the style pipeline during hydration.
   *
   * When `false`: no client JS is shipped and `transferCache` is set
   * to `false`. Use this for fully static sites without `client:*`
   * directives.
   */
  islands?: boolean;
}

/**
 * Astro integration that automatically sets up Tasty SSR.
 *
 * Registers middleware for cross-component CSS deduplication and
 * optionally injects a client hydration script for island support.
 *
 * @example Basic setup (with islands)
 * ```ts
 * // astro.config.mjs
 * import { tastyIntegration } from '@tenphi/tasty/ssr/astro';
 *
 * export default defineConfig({
 *   integrations: [tastyIntegration()],
 * });
 * ```
 *
 * @example Static-only (no client JS)
 * ```ts
 * // astro.config.mjs
 * import { tastyIntegration } from '@tenphi/tasty/ssr/astro';
 *
 * export default defineConfig({
 *   integrations: [tastyIntegration({ islands: false })],
 * });
 * ```
 */
export function tastyIntegration(options?: TastyIntegrationOptions) {
  const { islands = true } = options ?? {};

  setMiddlewareTransferCache(islands);

  return {
    name: '@tenphi/tasty',
    hooks: {
      'astro:config:setup': ({
        addMiddleware,
        injectScript,
      }: {
        addMiddleware: (middleware: {
          entrypoint: string | URL;
          order: 'pre' | 'post';
        }) => void;
        injectScript: (stage: string, content: string) => void;
      }) => {
        addMiddleware({
          entrypoint: new URL('./astro-middleware.js', import.meta.url),
          order: 'pre',
        });

        if (islands) {
          injectScript(
            'before-hydration',
            `import "@tenphi/tasty/ssr/astro-client";`,
          );
        }
      },
    },
  };
}
