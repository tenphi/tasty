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

import { createElement, Fragment, useState, type ReactNode } from 'react';
import { useServerInsertedHTML } from 'next/navigation';

import { getConfig } from '../config';
import { ServerStyleCollector } from './collector';
import { getTastySSRContext } from './context';
import { hydrateTastyClasses } from './hydrate';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

// Auto-hydrate on module load (client only).
// Reads the class name list from `window.__TASTY__` populated by streaming scripts.
if (typeof window !== 'undefined') {
  hydrateTastyClasses();
}

export interface TastyRegistryProps {
  children: ReactNode;
  /**
   * Whether to embed the class-list script for client hydration.
   * Set to false to skip class transfer (e.g. for CSP restrictions).
   * Without it, client components may re-inject CSS that already exists
   * in server-rendered `<style>` tags. Default: true.
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

  const [collector] = useState(() => {
    if (isClient) return null;

    const instance = new ServerStyleCollector();

    registerSSRCollectorGetter(() => instance);

    return instance;
  });
  const nonce = getConfig().nonce;

  useServerInsertedHTML(() => {
    if (!collector) return null;

    const css = collector.flushCSS();
    const classNames = collector.getRenderedClassNames();

    if (!css) return null;

    const styleEl = createElement('style', {
      key: 'tasty-ssr-styles',
      'data-tasty-ssr': '',
      nonce,
      dangerouslySetInnerHTML: { __html: css },
    });

    if (!transferCache || classNames.length === 0) return styleEl;

    const classListJSON = classNames.map((n) => `"${n}"`).join(',');

    const scriptEl = createElement('script', {
      key: 'tasty-ssr-cache',
      nonce,
      dangerouslySetInnerHTML: {
        __html: `(window.__TASTY__=window.__TASTY__||[]).push(${classListJSON})`,
      },
    });

    return createElement(Fragment, null, styleEl, scriptEl);
  });

  return createElement(
    getTastySSRContext().Provider,
    { value: collector },
    children,
  );
}
