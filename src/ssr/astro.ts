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
import { registerSSRCollectorGetterGlobal } from './ssr-collector-ref';
import { setMiddlewareTransferCache } from './astro-transfer-cache';

// Wire up ALS-based collector discovery so computeStyles() can find
// the collector set by tastyMiddleware's runWithCollector().
// Uses globalThis so the getter is visible across Astro's separate
// module graphs (middleware vs page components).
registerSSRCollectorGetterGlobal(getSSRCollector);

export interface TastyMiddlewareOptions {
  /**
   * Whether to embed the class-list script for client hydration.
   * Set to false to skip class transfer (e.g. for CSP restrictions).
   * Without it, client components may re-inject CSS that already exists
   * in server-rendered `<style>` tags. Default: true.
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

    // Run the entire request — including body stream consumption — inside
    // the ALS context so that components rendering lazily during stream
    // reads can still find the collector via getSSRCollector().
    type Rendered =
      | { response: Response }
      | { html: string | null; status: number; headers: Headers };

    const rendered = await runWithCollector<Promise<Rendered>>(
      collector,
      async (): Promise<Rendered> => {
        const response = await next();
        const body = response.body;

        // Only process HTML responses. Reading a non-HTML body (e.g. an
        // image, font, or JSON endpoint) as UTF-8 text corrupts binary
        // payloads: every byte >= 0x80 is decoded to U+FFFD and re-encoded
        // as EF BF BD. Pass anything that isn't HTML straight through.
        const contentType = response.headers.get('content-type') ?? '';
        if (!body || !contentType.includes('text/html')) {
          return { response };
        }

        const reader = body.pipeThrough(new TextDecoderStream()).getReader();
        const parts: string[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
        }
        return {
          html: parts.join(''),
          status: response.status,
          headers: response.headers,
        };
      },
    );

    // Non-HTML responses are returned untouched to avoid corrupting
    // binary payloads.
    if ('response' in rendered) {
      return rendered.response;
    }

    if (!rendered.html) {
      return new Response(null, {
        status: rendered.status,
        headers: rendered.headers,
      });
    }

    let { html } = rendered;

    const css = collector.getCSS();
    if (!css) {
      return new Response(html, {
        status: rendered.status,
        headers: rendered.headers,
      });
    }

    const nonce = getConfig().nonce;
    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
    const styleTag = `<style data-tasty-ssr${nonceAttr}>${css}</style>`;

    let cacheTag = '';
    if (transferCache) {
      const classNames = collector.getRenderedClassNames();
      if (classNames.length > 0) {
        const classListJSON = classNames.map((n) => `"${n}"`).join(',');
        cacheTag = `<script${nonceAttr}>(window.__TASTY__=window.__TASTY__||[]).push(${classListJSON})</script>`;
      }
    }

    const injection = styleTag + cacheTag;
    const idx = html.indexOf('</head>');
    if (idx !== -1) {
      html = html.slice(0, idx) + injection + html.slice(idx);
    } else {
      html = injection + html;
    }

    const headers = new Headers(rendered.headers);
    headers.delete('content-length');

    return new Response(html, {
      status: rendered.status,
      headers,
    });
  };
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
export function tastyIntegration(options?: TastyIntegrationOptions): {
  name: string;
  hooks: Record<string, (...args: never[]) => void>;
} {
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
        injectScript: (
          stage: 'head-inline' | 'before-hydration' | 'page' | 'page-ssr',
          content: string,
        ) => void;
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
