/**
 * React context for SSR collector discovery.
 *
 * Used by Next.js TastyRegistry to provide the ServerStyleCollector
 * to useStyles() via React context (the streaming-compatible path).
 */

import { createContext } from 'react';

import type { ServerStyleCollector } from './collector';

export const TastySSRContext = createContext<ServerStyleCollector | null>(null);
