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
import { createExtractionMetadata, extractAstroCSS } from './astro-extraction';
import type { AstroCSSStrategy } from './astro-extraction';
import { ServerStyleCollector } from './collector';
import { registerSSRCollectorGetterGlobal } from './ssr-collector-ref';

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

interface InternalTastyMiddlewareOptions extends TastyMiddlewareOptions {
  extractionMetadata?: boolean;
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
  const internalOptions = options as InternalTastyMiddlewareOptions | undefined;
  return async (
    context: { isPrerendered?: boolean },
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const transferCache = options?.transferCache ?? true;
    const extractionMetadata =
      internalOptions?.extractionMetadata === true &&
      context.isPrerendered === true;
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
    const metadataTag = extractionMetadata
      ? createExtractionMetadata(collector.getArtifacts())
      : '';

    let cacheTag = '';
    if (transferCache) {
      const classNames = collector.getRenderedClassNames();
      if (classNames.length > 0) {
        const classListJSON = classNames.map((n) => `"${n}"`).join(',');
        cacheTag = `<script${nonceAttr}>(window.__TASTY__=window.__TASTY__||[]).push(${classListJSON})</script>`;
      }
    }

    const injection = styleTag + metadataTag + cacheTag;
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

/**
 * Package subpaths of the middleware entrypoints registered by
 * `tastyIntegration()`.
 *
 * These must be bare specifiers rather than
 * `new URL('./astro-middleware.js', import.meta.url)`. The bundler is free to
 * hoist `tastyIntegration` into a shared chunk at a different directory depth
 * than `dist/ssr/`, which makes a relative URL resolve to a file that does not
 * exist and breaks the build for every consumer. A package subpath is resolved
 * by the consumer through our `exports` map, so it never depends on the
 * chunk layout.
 *
 * There are separate entrypoints instead of one parameterised entrypoint because
 * `addMiddleware()` cannot pass options: the integration runs when the Astro
 * config is loaded, while the middleware module is evaluated in the server
 * runtime — a different process for built output — so module-level state set
 * by the integration is not visible to the middleware.
 */
const MIDDLEWARE_ENTRYPOINT = '@tenphi/tasty/ssr/astro-middleware';
const MIDDLEWARE_ENTRYPOINT_STATIC =
  '@tenphi/tasty/ssr/astro-middleware-static';
const MIDDLEWARE_ENTRYPOINT_EXTRACT =
  '@tenphi/tasty/ssr/astro-middleware-extract';
const MIDDLEWARE_ENTRYPOINT_EXTRACT_STATIC =
  '@tenphi/tasty/ssr/astro-middleware-extract-static';

export interface TastyIntegrationCSSOptions {
  /** CSS delivery mode. Extraction only applies to prerendered builds. */
  mode?: 'inline' | 'extract';
  /**
   * `shared` extracts the largest common cascade-safe block. `single` emits
   * the safe union of generated component classes. Default: `shared`.
   */
  strategy?: AstroCSSStrategy;
}

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
  /** Configure inline or build-wide extracted CSS delivery. */
  css?: TastyIntegrationCSSOptions;
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
  const cssMode = options?.css?.mode ?? 'inline';
  const cssStrategy = options?.css?.strategy ?? 'shared';
  let base = '/';
  let assets = '_astro';

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
          entrypoint:
            cssMode === 'extract'
              ? islands
                ? MIDDLEWARE_ENTRYPOINT_EXTRACT
                : MIDDLEWARE_ENTRYPOINT_EXTRACT_STATIC
              : islands
                ? MIDDLEWARE_ENTRYPOINT
                : MIDDLEWARE_ENTRYPOINT_STATIC,
          order: 'pre',
        });

        if (islands) {
          injectScript(
            'before-hydration',
            `import "@tenphi/tasty/ssr/astro-client";`,
          );
        }
      },
      'astro:config:done': ({
        config,
      }: {
        config: { base?: string; build?: { assets?: string } };
      }) => {
        base = config.base ?? '/';
        assets = config.build?.assets ?? '_astro';
      },
      'astro:build:done': async ({ dir }: { dir: URL }) => {
        if (cssMode !== 'extract') return;
        await extractAstroCSS({ dir, base, assets, strategy: cssStrategy });
      },
    },
  };
}
