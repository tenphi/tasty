/**
 * Hook-free, synchronous style computation.
 *
 * Extracts the core logic from useStyles() into a plain function that can
 * be called during React render without any hooks. On the client, styles
 * are injected synchronously (idempotent via the injector cache). On the
 * server, styles are collected via the SSR collector.
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
  inject,
  keyframes,
  property,
} from './injector';
import type { FontFaceDescriptors, KeyframesSteps } from './injector/types';
import {
  extractLocalCounterStyle,
  formatCounterStyleRule,
  hasLocalCounterStyle,
} from './counter-style';
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
import { extractLocalProperties, hasLocalProperties } from './properties';
import { collectAutoInferredProperties } from './ssr/collect-auto-properties';
import type { ServerStyleCollector } from './ssr/collector';
import { getRegisteredSSRCollector } from './ssr/ssr-collector-ref';
import { formatKeyframesCSS } from './ssr/format-keyframes';
import { formatPropertyCSS } from './ssr/format-property';
import type { Styles } from './styles/types';
import { hasKeys } from './utils/has-keys';
import { resolveRecipes } from './utils/resolve-recipes';

export interface ComputeStylesResult {
  className: string;
}

export interface ComputeStylesOptions {
  ssrCollector?: ServerStyleCollector | null;
}

interface ProcessedChunk {
  name: string;
  styleKeys: string[];
  cacheKey: string;
  renderResult: RenderResult;
  className: string;
}

const EMPTY_RESULT: ComputeStylesResult = { className: '' };

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

  const { className } = inject(renderResult.rules, { cacheKey });

  return { name: chunkName, styleKeys, cacheKey, renderResult, className };
}

/**
 * Inject keyframes synchronously and return a name replacement map.
 * On the client, keyframes are injected into the DOM.
 */
function injectKeyframesSync(
  usedKeyframes: Record<string, KeyframesSteps>,
): Map<string, string> | null {
  let nameMap: Map<string, string> | null = null;

  for (const [name, steps] of Object.entries(usedKeyframes)) {
    const result = keyframes(steps, { name });
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
): void {
  for (const chunk of chunks) {
    if (chunk.renderResult.rules.length > 0) {
      const rulesToInject: StyleResult[] = nameMap
        ? chunk.renderResult.rules.map((rule) => ({
            ...rule,
            declarations: replaceAnimationNames(rule.declarations, nameMap!),
          }))
        : chunk.renderResult.rules;

      inject(rulesToInject, { cacheKey: chunk.cacheKey });
    }
  }
}

/**
 * Inject all ancillary rules (properties, font-faces, counter-styles) synchronously.
 */
function injectAncillarySync(styles: Styles): void {
  if (hasLocalProperties(styles)) {
    const localProperties = extractLocalProperties(styles);
    if (localProperties) {
      for (const [token, definition] of Object.entries(localProperties)) {
        property(token, definition);
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
          fontFace(family, desc);
        }
      }
    }
  }

  if (hasLocalCounterStyle(styles)) {
    const localCounterStyle = extractLocalCounterStyle(styles);
    if (localCounterStyle) {
      for (const [name, descriptors] of Object.entries(localCounterStyle)) {
        counterStyle(name, descriptors);
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
 * allocates class names, and injects (client) or collects (SSR) the CSS.
 *
 * On the client, CSS is injected synchronously into the DOM. The injector's
 * content-based cache makes this idempotent — repeated calls with the same
 * styles are essentially free (Map lookup + refCount bump).
 *
 * On the server, an SSR collector is discovered via AsyncLocalStorage
 * (or passed explicitly via options) and CSS is collected as strings.
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
  } else {
    injectAncillarySync(resolved);

    const usedKf = getUsedKeyframes(resolved);
    const nameMap = usedKf ? injectKeyframesSync(usedKf) : null;

    for (const [chunkName, chunkStyleKeys] of chunkMap) {
      const chunk = processChunkSync(resolved, chunkName, chunkStyleKeys);
      if (chunk) chunks.push(chunk);
    }

    if (nameMap) {
      injectChunkRulesSync(chunks, nameMap);
    }
  }

  if (chunks.length === 0) return EMPTY_RESULT;
  if (chunks.length === 1) return { className: chunks[0].className };

  return { className: chunks.map((c) => c.className).join(' ') };
}
