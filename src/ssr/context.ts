/**
 * React context for SSR collector discovery.
 *
 * Used by Next.js TastyRegistry to provide the ServerStyleCollector
 * to useStyles() via React context (the streaming-compatible path).
 *
 * This avoids relying on globalThis for cross-layer communication,
 * which leaks between RSC and SSR module graphs in Next.js App Router.
 */

import { createContext } from 'react';

import type { ServerStyleCollector } from './collector';

export const TastySSRContext = createContext<ServerStyleCollector | null>(null);
