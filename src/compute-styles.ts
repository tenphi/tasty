/**
 * Hook-free, synchronous style computation.
 *
 * Extracts the core logic from useStyles() into a plain function that can
 * be called during React render without any hooks. Three code paths:
 *
 * 1. SSR collector — styles collected via ServerStyleCollector
 * 2. Client inject — styles injected synchronously into the DOM
 * 3. RSC inline — styles returned as CSS strings for inline <style> emission
 *
 * This enables tasty() components to work as React Server Components.
 */

import {
  categorizeStyleKeys,
  generateChunkCacheKey,
  renderStylesForChunk,
} from './chunks';
import { getConfig, getGlobalKeyframes, hasGlobalKeyframes } from './config';
import {
  counterStyle,
  fontFace,
  func,
  inject,
  keyframes,
  property,
  touch,
} from './injector';
import type { FontFaceDescriptors, KeyframesSteps } from './injector/types';
import {
  extractLocalCounterStyle,
  formatCounterStyleRule,
  hasLocalCounterStyle,
} from './counter-style';
import {
  extractLocalFunctions,
  formatFunctionRule,
  hasLocalFunctions,
  parseFunctionName,
} from './functions';
import {
  extractLocalFontFace,
  fontFaceContentHash,
  formatFontFaceRule,
  hasLocalFontFace,
} from './font-face';
import {
  extractAnimationNamesFromStyles,
  extractLocalKeyframes,
  filterUsedKeyframes,
  hasLocalKeyframes,
  mergeKeyframes,
  replaceAnimationNames,
} from './keyframes';
import type { RenderResult, StyleResult } from './pipeline';
import {
  flushPendingCSS,
  getRSCCache,
  rscAllocateClassName,
} from './rsc-cache';
import type { RSCStyleCache } from './rsc-cache';
import { extractLocalProperties, hasLocalProperties } from './properties';
import { collectAutoInferredProperties } from './ssr/collect-auto-properties';
import type { ServerStyleCollector } from './ssr/collector';
import { formatKeyframesCSS } from './ssr/format-keyframes';
import { formatPropertyCSS } from './ssr/format-property';
import { formatRules } from './ssr/format-rules';
import { getRegisteredSSRCollector } from './ssr/ssr-collector-ref';
import type { Styles } from './styles/types';
import { hasKeys } from './utils/has-keys';
import { resolveRecipes } from './utils/resolve-recipes';

export interface ComputeStylesResult {
  className: string;
  /** CSS text to emit as an inline <style> tag (RSC mode only). */
  css?: string;
}

export interface ComputeStylesOptions {
  ssrCollector?: ServerStyleCollector | null;
  /** Target root for style injection (client only). Defaults to `document`. */
  root?: Document | ShadowRoot;
}

interface ProcessedChunk {
  name: string;
  styleKeys: string[];
  cacheKey: string;
  renderResult: RenderResult;
  className: string;
}

const EMPTY_RESULT: ComputeStylesResult = { className: '' };

// ---------------------------------------------------------------------------
// RSC (React Server Components) inline style support
// ---------------------------------------------------------------------------

/**
 * Mark internals as emitted for this RSC request.
 *
 * Internals (tokens, @property, @font-face, @counter-style) are emitted
 * exclusively by the SSR collector via ServerStyleCollector.collectInternals().
 * The SSR path is reliable because TastyRegistry is always present as a
 * client component in the root layout, guaranteeing SSR runs for every page.
 *
 * Previously this function also emitted internals and coordinated with SSR
 * via a globalThis flag, but that flag leaked across requests in the same
 * Node.js process, causing pages without RSC-rendered tasty components
 * (e.g. the playground route) to lose all token CSS.
 */
function collectInternalsRSC(rscCache: RSCStyleCache): string {
  if (rscCache.internalsEmitted) return '';
  rscCache.internalsEmitted = true;

  return '';
}

/**
 * Collect per-component ancillary CSS (keyframes, @property, font-face,
 * counter-style) for RSC mode.
 */
function collectAncillaryRSC(rscCache: RSCStyleCache, styles: Styles): string {
  const parts: string[] = [];

  const usedKf = getUsedKeyframes(styles);
  if (usedKf) {
    for (const [name, steps] of Object.entries(usedKf)) {
      const key = `__kf:${name}:${JSON.stringify(steps)}`;
      if (!rscCache.emittedKeys.has(key)) {
        rscCache.emittedKeys.add(key);
        parts.push(formatKeyframesCSS(name, steps));
      }
    }
  }

  if (hasLocalProperties(styles)) {
    const localProperties = extractLocalProperties(styles);
    if (localProperties) {
      for (const [token, definition] of Object.entries(localProperties)) {
        const key = `__prop:${token}`;
        if (!rscCache.emittedKeys.has(key)) {
          rscCache.emittedKeys.add(key);
          const css = formatPropertyCSS(token, definition);
          if (css) parts.push(css);
        }
      }
    }
  }

  if (hasLocalFontFace(styles)) {
    const localFontFace = extractLocalFontFace(styles);
    if (localFontFace) {
      for (const [family, input] of Object.entries(localFontFace)) {
        const descriptors: FontFaceDescriptors[] = Array.isArray(input)
          ? input
          : [input];
        for (const desc of descriptors) {
          const hash = fontFaceContentHash(family, desc);
          const key = `__ff:${hash}`;
          if (!rscCache.emittedKeys.has(key)) {
            rscCache.emittedKeys.add(key);
            parts.push(formatFontFaceRule(family, desc));
          }
        }
      }
    }
  }

  if (hasLocalCounterStyle(styles)) {
    const localCounterStyle = extractLocalCounterStyle(styles);
    if (localCounterStyle) {
      for (const [name, descriptors] of Object.entries(localCounterStyle)) {
        const key = `__cs:${name}:${JSON.stringify(descriptors)}`;
        if (!rscCache.emittedKeys.has(key)) {
          rscCache.emittedKeys.add(key);
          parts.push(formatCounterStyleRule(name, descriptors));
        }
      }
    }
  }

  if (hasLocalFunctions(styles)) {
    const localFunctions = extractLocalFunctions(styles);
    if (localFunctions) {
      for (const [name, definition] of Object.entries(localFunctions)) {
        const key = `__func:${parseFunctionName(name)}`;
        if (!rscCache.emittedKeys.has(key)) {
          rscCache.emittedKeys.add(key);
          parts.push(formatFunctionRule(name, definition));
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Process all chunks in RSC mode: render CSS to strings, allocate classNames,
 * and return combined { className, css }.
 */
function computeStylesRSC(
  styles: Styles,
  chunkMap: Map<string, string[]>,
): ComputeStylesResult {
  const rscCache = getRSCCache();
  const cssParts: string[] = [];
  const classNames: string[] = [];

  // Flush CSS accumulated by standalone style functions
  const pendingCSS = flushPendingCSS(rscCache);
  if (pendingCSS) cssParts.push(pendingCSS);

  const internalsCSS = collectInternalsRSC(rscCache);
  if (internalsCSS) cssParts.push(internalsCSS);

  for (const [chunkName, chunkStyleKeys] of chunkMap) {
    if (chunkStyleKeys.length === 0) continue;

    const cacheKey = generateChunkCacheKey(styles, chunkName, chunkStyleKeys);
    const { className, isNew } = rscAllocateClassName(rscCache, cacheKey);
    classNames.push(className);

    if (isNew) {
      const renderResult = renderStylesForChunk(
        styles,
        chunkName,
        chunkStyleKeys,
      );
      if (renderResult.rules.length > 0) {
        const css = formatRules(renderResult.rules, className);
        if (css) cssParts.push(css);
      }
    }
  }

  const ancillaryCSS = collectAncillaryRSC(rscCache, styles);
  if (ancillaryCSS) cssParts.push(ancillaryCSS);

  if (classNames.length === 0) return EMPTY_RESULT;

  const css = cssParts.join('\n');

  return {
    className: classNames.join(' '),
    css: css || undefined,
  };
}

/**
 * Get keyframes that are actually used in styles.
 * Returns null if no keyframes are used (fast path for zero overhead).
 */
function getUsedKeyframes(
  styles: Styles,
): Record<string, KeyframesSteps> | null {
  const hasLocal = hasLocalKeyframes(styles);
  const hasGlobal = hasGlobalKeyframes();
  if (!hasLocal && !hasGlobal) return null;

  const usedNames = extractAnimationNamesFromStyles(styles);
  if (usedNames.size === 0) return null;

  const local = hasLocal ? extractLocalKeyframes(styles) : null;
  const global = hasGlobal ? getGlobalKeyframes() : null;
  const allKeyframes = mergeKeyframes(local, global);

  return filterUsedKeyframes(allKeyframes, usedNames);
}

/**
 * Process a chunk on the SSR path: allocate via collector, render, collect CSS.
 */
function processChunkSSR(
  collector: ServerStyleCollector,
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
): ProcessedChunk | null {
  if (styleKeys.length === 0) return null;

  const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
  const { className, isNewAllocation } = collector.allocateClassName(cacheKey);

  if (isNewAllocation) {
    const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
    if (renderResult.rules.length > 0) {
      collector.collectChunk(cacheKey, className, renderResult.rules);
      return { name: chunkName, styleKeys, cacheKey, renderResult, className };
    }
    return null;
  }

  return {
    name: chunkName,
    styleKeys,
    cacheKey,
    renderResult: { rules: [] },
    className,
  };
}

/**
 * Process a chunk on the client: render, allocate className, and inject
 * CSS synchronously. The injector's cache makes this idempotent.
 */
function processChunkSync(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
  root?: Document | ShadowRoot,
): ProcessedChunk | null {
  if (styleKeys.length === 0) return null;

  const cacheKey = generateChunkCacheKey(styles, chunkName, styleKeys);
  const renderResult = renderStylesForChunk(
    styles,
    chunkName,
    styleKeys,
    cacheKey,
  );
  if (renderResult.rules.length === 0) return null;

  const { className } = inject(renderResult.rules, { cacheKey, root });

  return { name: chunkName, styleKeys, cacheKey, renderResult, className };
}

/**
 * Inject keyframes synchronously and return a name replacement map.
 * On the client, keyframes are injected into the DOM.
 */
function injectKeyframesSync(
  usedKeyframes: Record<string, KeyframesSteps>,
  root?: Document | ShadowRoot,
): Map<string, string> | null {
  let nameMap: Map<string, string> | null = null;

  for (const [name, steps] of Object.entries(usedKeyframes)) {
    const result = keyframes(steps, { name, root });
    const injectedName = result.toString();
    if (injectedName !== name) {
      if (!nameMap) nameMap = new Map();
      nameMap.set(name, injectedName);
    }
  }

  return nameMap;
}

/**
 * Inject chunk rules synchronously, replacing animation names if needed.
 */
function injectChunkRulesSync(
  chunks: ProcessedChunk[],
  nameMap: Map<string, string> | null,
  root?: Document | ShadowRoot,
): void {
  for (const chunk of chunks) {
    if (chunk.renderResult.rules.length > 0) {
      const rulesToInject: StyleResult[] = nameMap
        ? chunk.renderResult.rules.map((rule) => ({
            ...rule,
            declarations: replaceAnimationNames(rule.declarations, nameMap!),
          }))
        : chunk.renderResult.rules;

      inject(rulesToInject, { cacheKey: chunk.cacheKey, root });
    }
  }
}

/**
 * Inject all ancillary rules (properties, font-faces, counter-styles) synchronously.
 */
function injectAncillarySync(
  styles: Styles,
  root?: Document | ShadowRoot,
): void {
  if (hasLocalProperties(styles)) {
    const localProperties = extractLocalProperties(styles);
    if (localProperties) {
      for (const [token, definition] of Object.entries(localProperties)) {
        property(token, { ...definition, root });
      }
    }
  }

  if (hasLocalFontFace(styles)) {
    const localFontFace = extractLocalFontFace(styles);
    if (localFontFace) {
      for (const [family, input] of Object.entries(localFontFace)) {
        const descriptors: FontFaceDescriptors[] = Array.isArray(input)
          ? input
          : [input];
        for (const desc of descriptors) {
          fontFace(family, desc, { root });
        }
      }
    }
  }

  if (hasLocalCounterStyle(styles)) {
    const localCounterStyle = extractLocalCounterStyle(styles);
    if (localCounterStyle) {
      for (const [name, descriptors] of Object.entries(localCounterStyle)) {
        counterStyle(name, descriptors, { root });
      }
    }
  }

  if (hasLocalFunctions(styles)) {
    const localFunctions = extractLocalFunctions(styles);
    if (localFunctions) {
      for (const [name, definition] of Object.entries(localFunctions)) {
        func(name, definition, { root });
      }
    }
  }
}

/**
 * Collect all ancillary rules into the SSR collector.
 */
function collectAncillarySSR(
  collector: ServerStyleCollector,
  styles: Styles,
  chunks: ProcessedChunk[],
): void {
  const usedKf = getUsedKeyframes(styles);
  if (usedKf) {
    for (const [name, steps] of Object.entries(usedKf)) {
      const css = formatKeyframesCSS(name, steps);
      collector.collectKeyframes(name, css);
    }
  }

  if (hasLocalProperties(styles)) {
    const localProperties = extractLocalProperties(styles);
    if (localProperties) {
      for (const [token, definition] of Object.entries(localProperties)) {
        const css = formatPropertyCSS(token, definition);
        if (css) {
          collector.collectProperty(token, css);
        }
      }
    }
  }

  if (hasLocalFontFace(styles)) {
    const localFontFace = extractLocalFontFace(styles);
    if (localFontFace) {
      for (const [family, input] of Object.entries(localFontFace)) {
        const descriptors: FontFaceDescriptors[] = Array.isArray(input)
          ? input
          : [input];
        for (const desc of descriptors) {
          const hash = fontFaceContentHash(family, desc);
          const css = formatFontFaceRule(family, desc);
          collector.collectFontFace(hash, css);
        }
      }
    }
  }

  if (hasLocalCounterStyle(styles)) {
    const localCounterStyle = extractLocalCounterStyle(styles);
    if (localCounterStyle) {
      for (const [name, descriptors] of Object.entries(localCounterStyle)) {
        const css = formatCounterStyleRule(name, descriptors);
        collector.collectCounterStyle(name, css);
      }
    }
  }

  if (hasLocalFunctions(styles)) {
    const localFunctions = extractLocalFunctions(styles);
    if (localFunctions) {
      for (const [name, definition] of Object.entries(localFunctions)) {
        const css = formatFunctionRule(name, definition);
        collector.collectFunction(parseFunctionName(name), css);
      }
    }
  }

  if (getConfig().autoPropertyTypes !== false) {
    const allRules = chunks.flatMap((c) => c.renderResult.rules);
    if (allRules.length > 0) {
      collectAutoInferredProperties(allRules, collector, styles);
    }
  }
}

/**
 * Synchronous, hook-free style computation.
 *
 * Resolves recipes, categorizes style keys into chunks, renders CSS rules,
 * allocates class names, and injects / collects / returns the CSS.
 *
 * Three code paths:
 * 1. SSR collector — discovered via ALS or passed explicitly; CSS collected
 * 2. RSC inline — no collector and no `document`; CSS returned as `result.css`
 *    for the caller to emit as an inline `<style>` tag
 * 3. Client inject — CSS injected synchronously into the DOM (idempotent)
 *
 * @param styles - Tasty styles object (or undefined for no styles)
 * @param options - Optional SSR collector override
 */
export function computeStyles(
  styles: Styles | undefined,
  options?: ComputeStylesOptions,
): ComputeStylesResult {
  if (!styles || !hasKeys(styles as Record<string, unknown>)) {
    return EMPTY_RESULT;
  }

  const resolved = resolveRecipes(styles);
  const chunkMap = categorizeStyleKeys(resolved as Record<string, unknown>);

  const collector =
    options?.ssrCollector !== undefined
      ? options.ssrCollector
      : getRegisteredSSRCollector();

  const chunks: ProcessedChunk[] = [];

  if (collector) {
    collector.collectInternals();

    for (const [chunkName, chunkStyleKeys] of chunkMap) {
      const chunk = processChunkSSR(
        collector,
        resolved,
        chunkName,
        chunkStyleKeys,
      );
      if (chunk) chunks.push(chunk);
    }

    collectAncillarySSR(collector, resolved, chunks);
  } else if (typeof document === 'undefined') {
    // RSC path: render CSS to strings for inline <style> emission
    return computeStylesRSC(resolved, chunkMap);
  } else {
    const root = options?.root;

    injectAncillarySync(resolved, root);

    const usedKf = getUsedKeyframes(resolved);
    const nameMap = usedKf ? injectKeyframesSync(usedKf, root) : null;

    for (const [chunkName, chunkStyleKeys] of chunkMap) {
      const chunk = processChunkSync(resolved, chunkName, chunkStyleKeys, root);
      if (chunk) chunks.push(chunk);
    }

    if (nameMap) {
      injectChunkRulesSync(chunks, nameMap, root);
    }

    for (const chunk of chunks) {
      touch(chunk.className, { root });
    }
  }

  if (chunks.length === 0) return EMPTY_RESULT;
  if (chunks.length === 1) return { className: chunks[0].className };

  return { className: chunks.map((c) => c.className).join(' ') };
}
