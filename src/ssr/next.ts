/**
 * Next.js integration for Tasty SSR.
 *
 * Provides TastyRegistry for App Router (streaming via useServerInsertedHTML)
 * and createTastySSRDocument for Pages Router (non-streaming).
 *
 * Import from '@tenphi/tasty/ssr/next'.
 */

'use client';

/// <reference path="./next-navigation.d.ts" />

import {
  createElement,
  Fragment,
  useState,
  type ReactNode,
} from 'react';
import { useServerInsertedHTML } from 'next/navigation';

import { getConfig } from '../config';
import { ServerStyleCollector } from './collector';
import { TastySSRContext } from './context';
import { hydrateTastyCache } from './hydrate';

// Auto-hydrate on module load (client only).
// When this module is imported by the TastyRegistry client component,
// the streaming cache scripts have already populated __TASTY_SSR_CACHE__.
if (typeof window !== 'undefined' && window.__TASTY_SSR_CACHE__) {
  hydrateTastyCache(window.__TASTY_SSR_CACHE__);
}

export interface TastyRegistryProps {
  children: ReactNode;
  /**
   * Whether to embed the cache state script for client hydration.
   * Set to false to skip cache transfer (useful when cache size
   * exceeds the hydration benefit). Default: true.
   */
  transferCache?: boolean;
}

/**
 * Next.js App Router registry for Tasty SSR.
 *
 * Wraps the component tree with a ServerStyleCollector and flushes
 * collected CSS into the HTML stream via useServerInsertedHTML.
 *
 * @example
 * ```tsx
 * // app/tasty-registry.tsx
 * 'use client';
 * import { TastyRegistry } from '@tenphi/tasty/ssr/next';
 * export default function TastyStyleRegistry({ children }) {
 *   return <TastyRegistry>{children}</TastyRegistry>;
 * }
 *
 * // app/layout.tsx
 * import TastyStyleRegistry from './tasty-registry';
 * export default function RootLayout({ children }) {
 *   return <html><body>
 *     <TastyStyleRegistry>{children}</TastyStyleRegistry>
 *   </body></html>;
 * }
 * ```
 */
export function TastyRegistry({
  children,
  transferCache = true,
}: TastyRegistryProps) {
  const isClient = typeof window !== 'undefined';

  const [collector] = useState(() =>
    isClient ? null : new ServerStyleCollector(),
  );
  const nonce = getConfig().nonce;

  useServerInsertedHTML(() => {
    if (!collector) return null;

    const css = collector.flushCSS();
    const cacheState = collector.getCacheState();

    if (!css) return null;

    const styleEl = createElement('style', {
      key: 'tasty-ssr-styles',
      'data-tasty-ssr': '',
      nonce,
      dangerouslySetInnerHTML: { __html: css },
    });

    if (!transferCache) return styleEl;

    const scriptEl = createElement('script', {
      key: 'tasty-ssr-cache',
      nonce,
      dangerouslySetInnerHTML: {
        __html:
          `(window.__TASTY_SSR_CACHE__=window.__TASTY_SSR_CACHE__||{entries:{},classCounter:0});` +
          `Object.assign(window.__TASTY_SSR_CACHE__.entries,${JSON.stringify(cacheState.entries)});` +
          `window.__TASTY_SSR_CACHE__.classCounter=${cacheState.classCounter};`,
      },
    });

    return createElement(Fragment, null, styleEl, scriptEl);
  });

  return createElement(
    TastySSRContext.Provider,
    { value: collector },
    children,
  );
}
