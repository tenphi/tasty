import { useInsertionEffect, useMemo } from 'react';

import { getGlobalInjector } from '../config';
import { fontFaceContentHash, formatFontFaceRule } from '../font-face';
import type { FontFaceDescriptors, FontFaceInput } from '../injector/types';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseFontFaceOptions {
  root?: Document | ShadowRoot;
}

/**
 * Hook to inject CSS @font-face rules.
 * Permanent — no cleanup on unmount. Deduplicates by content hash.
 *
 * @param family - The font-family name
 * @param input - Single descriptor object or array of descriptors (for multiple weights/styles)
 * @param options - Optional settings (e.g. Shadow DOM root)
 *
 * @example Single weight
 * ```tsx
 * function App() {
 *   useFontFace('Brand Sans', {
 *     src: 'url("/fonts/brand-sans.woff2") format("woff2")',
 *     fontWeight: '400 700',
 *     fontDisplay: 'swap',
 *   });
 *
 *   return <div style={{ fontFamily: '"Brand Sans", sans-serif' }}>Hello</div>;
 * }
 * ```
 *
 * @example Multiple weights
 * ```tsx
 * function App() {
 *   useFontFace('Brand Sans', [
 *     { src: 'url("/fonts/brand-regular.woff2") format("woff2")', fontWeight: 400, fontDisplay: 'swap' },
 *     { src: 'url("/fonts/brand-bold.woff2") format("woff2")', fontWeight: 700, fontDisplay: 'swap' },
 *   ]);
 *
 *   return <div style={{ fontFamily: '"Brand Sans", sans-serif' }}>Hello</div>;
 * }
 * ```
 */
export function useFontFace(
  family: string,
  input: FontFaceInput,
  options?: UseFontFaceOptions,
): void {
  const ssrCollector = getRegisteredSSRCollector();

  const inputKey = useMemo(() => JSON.stringify(input), [input]);

  // SSR path: collect @font-face CSS during render
  useMemo(() => {
    if (!ssrCollector || !family) return;

    const descriptors: FontFaceDescriptors[] = Array.isArray(input)
      ? input
      : [input];

    for (const desc of descriptors) {
      const hash = fontFaceContentHash(family, desc);
      const css = formatFontFaceRule(family, desc);
      ssrCollector.collectFontFace(hash, css);
    }
  }, [ssrCollector, family, inputKey]);

  // Client path: inject via DOM
  useInsertionEffect(() => {
    if (!family) return;

    const injector = getGlobalInjector();
    const descriptors: FontFaceDescriptors[] = Array.isArray(input)
      ? input
      : [input];

    for (const desc of descriptors) {
      injector.fontFace(family, desc, { root: options?.root });
    }
  }, [family, inputKey, options?.root]);
}
