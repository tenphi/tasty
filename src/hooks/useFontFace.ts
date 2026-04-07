import { getGlobalInjector } from '../config';
import { fontFaceContentHash, formatFontFaceRule } from '../font-face';
import type { FontFaceDescriptors, FontFaceInput } from '../injector/types';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';

interface UseFontFaceOptions {
  root?: Document | ShadowRoot;
}

/**
 * Inject CSS @font-face rules.
 * Permanent — no cleanup on unmount. Deduplicates by content hash.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
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
  if (!family) return;

  const descriptors: FontFaceDescriptors[] = Array.isArray(input)
    ? input
    : [input];

  const target = getStyleTarget();

  if (target.mode === 'ssr') {
    for (const desc of descriptors) {
      const hash = fontFaceContentHash(family, desc);
      const css = formatFontFaceRule(family, desc);
      target.collector.collectFontFace(hash, css);
    }
    return;
  }

  if (target.mode === 'rsc') {
    for (const desc of descriptors) {
      const hash = fontFaceContentHash(family, desc);
      const css = formatFontFaceRule(family, desc);
      pushRSCCSS(target.cache, `__ff:${hash}`, css);
    }
    return;
  }

  const injector = getGlobalInjector();
  for (const desc of descriptors) {
    injector.fontFace(family, desc, { root: options?.root });
  }
}
