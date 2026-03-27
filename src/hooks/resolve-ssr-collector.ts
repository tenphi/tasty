import type { ServerStyleCollector } from '../ssr/collector';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

/**
 * Resolve the SSR collector from React context or AsyncLocalStorage.
 * Returns null on the client (no collector available).
 */
export function resolveSSRCollector(
  reactContext: ServerStyleCollector | null,
): ServerStyleCollector | null {
  if (reactContext) return reactContext;
  return getRegisteredSSRCollector();
}
