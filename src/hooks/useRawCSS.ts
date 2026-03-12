import { useContext, useInsertionEffect, useMemo, useRef } from 'react';

import { injectRawCSS } from '../injector';
import type { ServerStyleCollector } from '../ssr/collector';
import { TastySSRContext } from '../ssr/context';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseRawCSSOptions {
  root?: Document | ShadowRoot;
}

function resolveSSRCollector(
  reactContext: ServerStyleCollector | null,
): ServerStyleCollector | null {
  if (reactContext) return reactContext;
  return getRegisteredSSRCollector();
}

/**
 * Hook to inject raw CSS text directly without parsing.
 * This is a low-overhead alternative for injecting global CSS that doesn't need tasty processing.
 *
 * The CSS is inserted into a separate style element (data-tasty-raw) to avoid conflicts
 * with tasty's chunked style sheets.
 *
 * @example Static CSS string
 * ```tsx
 * function GlobalStyles() {
 *   useRawCSS(`
 *     body {
 *       margin: 0;
 *       padding: 0;
 *       font-family: sans-serif;
 *     }
 *   `);
 *
 *   return null;
 * }
 * ```
 *
 * @example Factory function with dependencies (like useMemo)
 * ```tsx
 * function ThemeStyles({ theme }: { theme: 'light' | 'dark' }) {
 *   useRawCSS(() => `
 *     :root {
 *       --bg-color: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
 *       --text-color: ${theme === 'dark' ? '#ffffff' : '#1a1a1a'};
 *     }
 *   `, [theme]);
 *
 *   return null;
 * }
 * ```
 *
 * @example With options
 * ```tsx
 * function ShadowStyles({ shadowRoot }) {
 *   useRawCSS(() => `.scoped { color: red; }`, [], { root: shadowRoot });
 *   return null;
 * }
 * ```
 */

// Overload 1: Static CSS string
export function useRawCSS(css: string, options?: UseRawCSSOptions): void;

// Overload 2: Factory function with dependencies
export function useRawCSS(
  factory: () => string,
  deps: readonly unknown[],
  options?: UseRawCSSOptions,
): void;

// Implementation
export function useRawCSS(
  cssOrFactory: string | (() => string),
  depsOrOptions?: readonly unknown[] | UseRawCSSOptions,
  options?: UseRawCSSOptions,
): void {
  const ssrContextValue = useContext(TastySSRContext);
  const ssrCollector = resolveSSRCollector(ssrContextValue);

  // Detect which overload is being used
  const isFactory = typeof cssOrFactory === 'function';

  // Parse arguments based on overload
  const deps =
    isFactory && Array.isArray(depsOrOptions) ? depsOrOptions : undefined;
  const opts = isFactory
    ? options
    : (depsOrOptions as UseRawCSSOptions | undefined);

  // Memoize CSS - for factory functions, use provided deps; for strings, use the string itself
  const css = useMemo(
    () =>
      isFactory ? (cssOrFactory as () => string)() : (cssOrFactory as string),

    isFactory ? (deps ?? []) : [cssOrFactory],
  );

  // SSR path: collect raw CSS during render
  useMemo(() => {
    if (!ssrCollector || !css.trim()) return;

    const key = `raw:${css.length}:${css.slice(0, 64)}`;
    ssrCollector.collectRawCSS(key, css);
  }, [ssrCollector, css]);

  const disposeRef = useRef<(() => void) | null>(null);

  // Client path: inject via DOM
  useInsertionEffect(() => {
    disposeRef.current?.();

    if (!css.trim()) {
      disposeRef.current = null;
      return;
    }

    const { dispose } = injectRawCSS(css, opts);
    disposeRef.current = dispose;

    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [css, opts?.root]);
}
