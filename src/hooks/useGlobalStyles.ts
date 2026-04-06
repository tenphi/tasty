import { useInsertionEffect, useMemo, useRef } from 'react';

import { getConfig } from '../config';
import { injectGlobal } from '../injector';
import type { StyleResult } from '../pipeline';
import { renderStyles } from '../pipeline';
import { collectAutoInferredProperties } from '../ssr/collect-auto-properties';
import { formatGlobalRules } from '../ssr/format-global-rules';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';
import type { Styles } from '../styles/types';
import { resolveRecipes } from '../utils/resolve-recipes';

/**
 * Hook to inject global styles for a given selector.
 * Useful for styling elements by selector without generating classNames.
 *
 * SSR-aware: when a ServerStyleCollector is available, CSS is collected
 * during the render phase instead of being injected into the DOM.
 *
 * @param selector - CSS selector to apply styles to (e.g., '.my-class', ':root', 'body')
 * @param styles - Tasty styles object
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   useGlobalStyles('.card', {
 *     padding: '2x',
 *     radius: '1r',
 *     fill: '#white',
 *   });
 *
 *   return <div className="card">Content</div>;
 * }
 * ```
 */
export function useGlobalStyles(selector: string, styles?: Styles): void {
  const ssrCollector = getRegisteredSSRCollector();

  const disposeRef = useRef<(() => void) | null>(null);

  // Resolve recipes before rendering (zero overhead if no recipes configured)
  const resolvedStyles = useMemo(() => {
    if (!styles) return styles;
    return resolveRecipes(styles);
  }, [styles]);

  // Render styles with the provided selector
  // Note: renderStyles overload with selector string returns StyleResult[] directly
  const styleResults = useMemo((): StyleResult[] => {
    if (!resolvedStyles) return [];

    if (!selector) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Tasty] useGlobalStyles: selector is required and cannot be empty. ' +
            'Styles will not be injected.',
        );
      }
      return [];
    }

    const result = renderStyles(resolvedStyles, selector);
    return result as StyleResult[];
  }, [resolvedStyles, selector]);

  // SSR path: collect CSS during render
  useMemo(() => {
    if (!ssrCollector || styleResults.length === 0) return;

    ssrCollector.collectInternals();

    const css = formatGlobalRules(styleResults);
    if (css) {
      const key = `global:${selector}:${css.length}:${css.slice(0, 64)}`;
      ssrCollector.collectGlobalStyles(key, css);
    }

    if (getConfig().autoPropertyTypes !== false) {
      collectAutoInferredProperties(styleResults, ssrCollector, resolvedStyles);
    }
  }, [ssrCollector, styleResults, selector]);

  // Client path: inject via DOM
  useInsertionEffect(() => {
    disposeRef.current?.();

    if (styleResults.length > 0) {
      const { dispose } = injectGlobal(styleResults);
      disposeRef.current = dispose;
    } else {
      disposeRef.current = null;
    }

    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [styleResults]);
}
