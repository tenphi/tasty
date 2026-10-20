/**
 * React context for SSR collector discovery.
 *
 * Used by Next.js TastyRegistry to provide the ServerStyleCollector
 * to useStyles() via React context (the streaming-compatible path).
 *
 * This avoids relying on globalThis for cross-layer communication,
 * which leaks between RSC and SSR module graphs in Next.js App Router.
 *
 * The context is created lazily to avoid calling createContext() at
 * module evaluation time, which would break Server Components that
 * import from `@tenphi/tasty` without using any React hooks. React's
 * `react-server` build has no `createContext` export at all, so it is read
 * off the default export: a named import would fail to link there.
 */

import React from 'react';
import type { Context } from 'react';

import type { ServerStyleCollector } from './collector';

let _ctx: Context<ServerStyleCollector | null> | undefined;

export function getTastySSRContext(): Context<ServerStyleCollector | null> {
  if (!_ctx) {
    _ctx = React.createContext<ServerStyleCollector | null>(null);
  }
  return _ctx;
}
