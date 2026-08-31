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
import {
  getConfig,
  getGlobalKeyframes,
  getGlobalInjector,
  getNamePrefix,
  hasGlobalKeyframes,
  isFunctionsPolyfillEnabled,
  markStylesGenerated,
} from './config';
import {
  counterStyle,
  fontFace,
  func,
  holdKeyframes,
  ownKeyframes,
  property,
  touch,
} from './injector';
import type { FontFaceDescriptors, KeyframesSteps } from './injector/types';
import type { StyleInjector } from './injector/injector';
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
  registerLocalFunctionPolyfills,
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
  referencesAnimation,
  resolveKeyframesNames,
  replaceAnimationNames,
} from './keyframes';
import type { RenderResult, StyleResult } from './pipeline';
import {
  flushPendingCSS,
  getRSCCache,
  prepareRSCCache,
  rscAllocateClassName,
} from './rsc-cache';
import type { RSCStyleCache } from './rsc-cache';
import {
  extractLocalProperties,
  getEffectiveDefinition,
  hasLocalProperties,
  normalizePropertyDefinition,
} from './properties';
import { collectAutoInferredProperties } from './ssr/collect-auto-properties';
import type { ServerStyleCollector } from './ssr/collector';
import { formatKeyframesCSS } from './ssr/format-keyframes';
import { formatPropertyCSS } from './ssr/format-property';
import { formatRules } from './ssr/format-rules';
import { getRegisteredSSRCollector } from './ssr/ssr-collector-ref';
import type { Styles } from './styles/types';
import { hasKeys } from './utils/has-keys';
import { resolveRecipes } from './utils/resolve-recipes';
import {
  applyRegisteredDependenciesToInjector,
  findPrecompiledChunk,
  precompileRuntimeState,
} from './precompile/runtime';
import { ensurePrecompiledConfigValidated } from './precompile/registry';

export interface ComputeStylesResult {
  className: string;
  /** CSS text to emit as an inline <style> tag (RSC mode only). */
  css?: string;
}

export interface ComputeStylesOptions {
  ssrCollector?: ServerStyleCollector | null;
  /** Target root for style injection (client only). Defaults to `document`. */
  root?: Document | ShadowRoot;
  /**
   * Set when `styles` outlives this call and will be passed in again — a
   * `tasty()` factory's own styles object rather than a per-render merge.
   * It lets chunk cache keys be memoized on the object, which is worth the
   * bookkeeping only when there is a next render to spend it on.
   */
  stableStyles?: boolean;
}

interface ProcessedChunk {
  name: string;
  styleKeys: string[];
  cacheKey: string;
  renderResult: RenderResult;
  className: string;
  /** Local animations this chunk runs, by their authored names. */
  animations?: string[];
}

const EMPTY_RESULT: ComputeStylesResult = { className: '' };

function keyframeLookupSignature(
  names: Map<string, string> | null | undefined,
): string {
  if (!names || names.size === 0) return '';
  return [...names]
    .map(([authored, resolved]) => `${authored}=${resolved}`)
    .sort()
    .join(',');
}

function precompiledLookupKey(baseKey: string, signature: string): string {
  return signature ? `${baseKey}\0pkf:${signature}` : baseKey;
}

function lookupPrecompiledChunk(
  baseKey: string,
  signature: string,
  root?: Document | ShadowRoot,
) {
  // The single choke point for every path that trusts a catalog class name, and
  // the first moment the host's configuration is final. Cheap after the first
  // call: it returns on a revision check.
  ensurePrecompiledConfigValidated();

  if (root && typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    return null;
  }
  return findPrecompiledChunk(
    precompiledLookupKey(baseKey, signature),
    getNamePrefix(),
  );
}

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
  const rscKeyframeNames = usedKf ? resolveKeyframesNames(usedKf) : null;
  if (usedKf && rscKeyframeNames) {
    for (const [authored, steps] of Object.entries(usedKf)) {
      const name = rscKeyframeNames.get(authored) as string;
      const key = `__kf:${name}`;
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

  if (!isFunctionsPolyfillEnabled() && hasLocalFunctions(styles)) {
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
  stableStyles: boolean,
  precompiledEnabled = false,
): ComputeStylesResult {
  const rscCache = prepareRSCCache(getRSCCache());
  const cssParts: string[] = [];
  const classNames: string[] = [];
  const rscUsedKf = getUsedKeyframes(styles);
  const rscKeyframeNames = rscUsedKf ? resolveKeyframesNames(rscUsedKf) : null;
  const lookupSignature = precompiledEnabled
    ? keyframeLookupSignature(rscKeyframeNames)
    : '';

  // Flush CSS accumulated by standalone style functions
  const pendingCSS = flushPendingCSS(rscCache);
  if (pendingCSS) cssParts.push(pendingCSS);

  const internalsCSS = collectInternalsRSC(rscCache);
  if (internalsCSS) cssParts.push(internalsCSS);

  for (const [chunkName, chunkStyleKeys] of chunkMap) {
    if (chunkStyleKeys.length === 0) continue;

    const baseKey = generateChunkCacheKey(
      styles,
      chunkName,
      chunkStyleKeys,
      stableStyles,
    );

    const precompiled = precompiledEnabled
      ? lookupPrecompiledChunk(baseKey, lookupSignature)
      : null;
    if (precompiled) {
      classNames.push(precompiled.className);
      continue;
    }

    // Rendered before the class is allocated, for the same reason as the other
    // two paths: the key has to carry which keyframes these rules animate.
    const renderResult = renderStylesForChunk(
      styles,
      chunkName,
      chunkStyleKeys,
    );
    if (renderResult.rules.length === 0) continue;

    const { rules, cacheKey } = applyKeyframeNames(
      renderResult.rules,
      baseKey,
      rscKeyframeNames,
    );

    const { className, isNew } = rscAllocateClassName(rscCache, cacheKey);
    classNames.push(className);

    if (isNew) {
      const css = formatRules(rules, className);
      if (css) cssParts.push(css);
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
  stableStyles: boolean,
  keyframeNames?: Map<string, string> | null,
): ProcessedChunk | null {
  if (styleKeys.length === 0) return null;

  const baseKey = generateChunkCacheKey(
    styles,
    chunkName,
    styleKeys,
    stableStyles,
  );
  const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
  if (renderResult.rules.length === 0) return null;

  const { animations, rules, cacheKey } = applyKeyframeNames(
    renderResult.rules,
    baseKey,
    keyframeNames,
  );
  const { className, isNewAllocation } = collector.allocateClassName(cacheKey);

  if (isNewAllocation) {
    collector.collectChunk(cacheKey, className, rules);
    return {
      name: chunkName,
      styleKeys,
      cacheKey,
      renderResult: { ...renderResult, rules },
      className,
      animations,
    };
  }

  return {
    name: chunkName,
    styleKeys,
    cacheKey,
    renderResult: { rules: [] },
    className,
  };
}

/** Catalog-aware SSR path, kept off the unregistered runtime hot path. */
function processChunkSSRPrecompiled(
  collector: ServerStyleCollector,
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
  stableStyles: boolean,
  keyframeNames?: Map<string, string> | null,
  lookupSignature = '',
  precompiledEnabled = false,
): ProcessedChunk | null {
  if (styleKeys.length === 0) return null;

  const baseKey = generateChunkCacheKey(
    styles,
    chunkName,
    styleKeys,
    stableStyles,
  );

  if (precompiledEnabled && !collector.isPrecompileRecording()) {
    const precompiled = lookupPrecompiledChunk(baseKey, lookupSignature);
    if (precompiled) {
      return {
        name: chunkName,
        styleKeys,
        cacheKey: baseKey,
        renderResult: { rules: [] },
        className: precompiled.className,
        animations: [...precompiled.animations],
      };
    }
  }

  // Rendered before the class is allocated: the key has to carry which
  // keyframes these rules animate, or two components authoring the same
  // shorthand over different definitions would share a class here and
  // disagree with the client, which does carry it.
  const renderResult = renderStylesForChunk(styles, chunkName, styleKeys);
  if (renderResult.rules.length === 0) return null;

  const { animations, rules, cacheKey } = applyKeyframeNames(
    renderResult.rules,
    baseKey,
    keyframeNames,
  );

  const { className, isNewAllocation } = collector.allocateClassName(cacheKey);

  if (collector.isPrecompileRecording()) {
    collector.recordPrecompiledChunk(
      precompiledLookupKey(baseKey, lookupSignature),
      className,
      animations,
    );
  }

  if (isNewAllocation) {
    collector.collectChunk(cacheKey, className, rules);
    return {
      name: chunkName,
      styleKeys,
      cacheKey,
      renderResult: { ...renderResult, rules },
      className,
      animations,
    };
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
 * Point a chunk's rules at the resolved keyframe names, and fold those names
 * into its cache key.
 *
 * Both halves matter, and both have to happen before the rules are written
 * anywhere: the declarations have to name the animation that will exist, and
 * the key has to distinguish two components that authored the same shorthand
 * over different definitions. Shared by the client and the server so they
 * cannot disagree about either.
 */
function applyKeyframeNames(
  ruleset: StyleResult[],
  baseKey: string,
  keyframeNames?: Map<string, string> | null,
): { animations: string[]; rules: StyleResult[]; cacheKey: string } {
  if (!keyframeNames || keyframeNames.size === 0) {
    return { animations: [], rules: ruleset, cacheKey: baseKey };
  }

  // Whole tokens only, so `crossfade` is not a use of `fade`.
  const animations = [...keyframeNames.keys()].filter((authored) =>
    ruleset.some((rule) => referencesAnimation(rule.declarations, authored)),
  );

  if (animations.length === 0) {
    return { animations, rules: ruleset, cacheKey: baseKey };
  }

  const rules = ruleset.map((rule) => ({
    ...rule,
    declarations: replaceAnimationNames(rule.declarations, keyframeNames),
  }));

  const cacheKey = `${baseKey}\u0000kf:${animations
    .map((authored) => `${authored}=${keyframeNames.get(authored)}`)
    .sort()
    .join(',')}`;

  return { animations, rules, cacheKey };
}

/**
 * Process a chunk on the client: render, allocate className, and inject
 * CSS synchronously. The injector's cache makes this idempotent.
 */
function processChunkSync(
  styles: Styles,
  chunkName: string,
  styleKeys: string[],
  stableStyles: boolean,
  root?: Document | ShadowRoot,
  keyframeNames?: Map<string, string> | null,
  lookupSignature = '',
  clientInjector?: StyleInjector,
  precompiledEnabled = false,
): ProcessedChunk | null {
  if (styleKeys.length === 0) return null;

  const cacheKey = generateChunkCacheKey(
    styles,
    chunkName,
    styleKeys,
    stableStyles,
  );
  const precompiled = precompiledEnabled
    ? lookupPrecompiledChunk(cacheKey, lookupSignature, root)
    : null;
  if (precompiled) {
    clientInjector?.recordPrecompiledHit(precompiled.className, { root });
    return {
      name: chunkName,
      styleKeys,
      cacheKey,
      renderResult: { rules: [] },
      className: precompiled.className,
      animations: [...precompiled.animations],
    };
  }
  const prepared = clientInjector?.prepareClassName(cacheKey, {
    root,
  });
  if (prepared?.isExisting) {
    return {
      name: chunkName,
      styleKeys,
      cacheKey,
      renderResult: { rules: [] },
      className: prepared.className,
    };
  }
  const renderResult = renderStylesForChunk(
    styles,
    chunkName,
    styleKeys,
    cacheKey,
  );
  if (renderResult.rules.length === 0) return null;

  const {
    animations,
    rules,
    cacheKey: injectKey,
  } = applyKeyframeNames(renderResult.rules, cacheKey, keyframeNames);

  // `pin: false` — the render path keeps no dispose handle; the DOM is the
  // record of use, and `gc()` reclaims the class once no element carries it.
  const { className } = (clientInjector ?? getGlobalInjector()).inject(rules, {
    cacheKey: injectKey,
    root,
    pin: false,
    preparedClassName: injectKey === cacheKey ? prepared?.className : undefined,
  });

  return {
    name: chunkName,
    styleKeys,
    cacheKey: injectKey,
    renderResult: { ...renderResult, rules },
    className,
    animations,
  };
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

  if (!isFunctionsPolyfillEnabled() && hasLocalFunctions(styles)) {
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
    // Emitted under the resolved name, so two different `fade` definitions are
    // two rules rather than one deduplicated by name — and so the client
    // agrees about which one a class animates.
    const names = resolveKeyframesNames(usedKf);
    for (const [authored, steps] of Object.entries(usedKf)) {
      const name = names.get(authored) as string;
      collector.collectKeyframes(name, formatKeyframesCSS(name, steps), {
        source: 'component',
        contentKey: `${name}\0${JSON.stringify(steps)}`,
        rscKeys: [`__kf:${name}`],
      });
    }
  }

  if (hasLocalProperties(styles)) {
    const localProperties = extractLocalProperties(styles);
    if (localProperties) {
      for (const [token, definition] of Object.entries(localProperties)) {
        const css = formatPropertyCSS(token, definition);
        if (css) {
          const effective = getEffectiveDefinition(token, definition);
          collector.collectProperty(token, css, {
            source: 'component',
            cssName: effective.isValid ? effective.cssName : undefined,
            normalizedDefinition: effective.isValid
              ? normalizePropertyDefinition(effective.definition)
              : undefined,
            rscKey: `__prop:${token}`,
          });
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
          collector.collectFontFace(hash, css, { source: 'component' });
        }
      }
    }
  }

  if (hasLocalCounterStyle(styles)) {
    const localCounterStyle = extractLocalCounterStyle(styles);
    if (localCounterStyle) {
      for (const [name, descriptors] of Object.entries(localCounterStyle)) {
        const css = formatCounterStyleRule(name, descriptors);
        collector.collectCounterStyle(name, css, {
          source: 'component',
          rscKeys: [`__cs:${name}:${JSON.stringify(descriptors)}`],
        });
      }
    }
  }

  if (!isFunctionsPolyfillEnabled() && hasLocalFunctions(styles)) {
    const localFunctions = extractLocalFunctions(styles);
    if (localFunctions) {
      for (const [name, definition] of Object.entries(localFunctions)) {
        const css = formatFunctionRule(name, definition);
        collector.collectFunction(parseFunctionName(name), css, {
          source: 'component',
        });
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

  // Only the caller's own object can be declared reusable. When recipe
  // resolution rewrites it, `resolved` is a fresh per-render object and
  // memoizing on it would be pure overhead.
  const stableStyles = options?.stableStyles === true && resolved === styles;

  // @function polyfill: register local definitions as inline closures BEFORE
  // any chunk is rendered, so call sites in this component expand to plain CSS.
  if (isFunctionsPolyfillEnabled() && hasLocalFunctions(resolved)) {
    registerLocalFunctionPolyfills(resolved);
  }

  const chunkMap = categorizeStyleKeys(resolved as Record<string, unknown>);
  const precompiledEnabled = precompileRuntimeState.active === true;

  const collector =
    options?.ssrCollector !== undefined
      ? options.ssrCollector
      : getRegisteredSSRCollector();

  const chunks: ProcessedChunk[] = [];

  if (collector) {
    if (precompiledEnabled) {
      collector.applyRegisteredPrecompiledDependencies();
    }
    collector.collectInternals();

    const ssrKf = getUsedKeyframes(resolved);
    const ssrKeyframeNames = ssrKf ? resolveKeyframesNames(ssrKf) : null;
    if (precompiledEnabled) {
      const lookupSignature = keyframeLookupSignature(ssrKeyframeNames);
      for (const [chunkName, chunkStyleKeys] of chunkMap) {
        const chunk = processChunkSSRPrecompiled(
          collector,
          resolved,
          chunkName,
          chunkStyleKeys,
          stableStyles,
          ssrKeyframeNames,
          lookupSignature,
          precompiledEnabled,
        );
        if (chunk) chunks.push(chunk);
      }
    } else {
      for (const [chunkName, chunkStyleKeys] of chunkMap) {
        const chunk = processChunkSSR(
          collector,
          resolved,
          chunkName,
          chunkStyleKeys,
          stableStyles,
          ssrKeyframeNames,
        );
        if (chunk) chunks.push(chunk);
      }
    }

    collectAncillarySSR(collector, resolved, chunks);
  } else if (typeof document === 'undefined') {
    // RSC path: render CSS to strings for inline <style> emission
    return computeStylesRSC(
      resolved,
      chunkMap,
      stableStyles,
      precompiledEnabled,
    );
  } else {
    const root = options?.root;
    const clientInjector = getGlobalInjector();

    if (
      precompiledEnabled &&
      (!root ||
        typeof ShadowRoot === 'undefined' ||
        !(root instanceof ShadowRoot))
    ) {
      applyRegisteredDependenciesToInjector(clientInjector, getNamePrefix());
    }
    markStylesGenerated();

    injectAncillarySync(resolved, root);

    const usedKf = getUsedKeyframes(resolved);

    // Names first, and resolved the same way on every path: the rules that
    // animate them carry the name, and a rule written before it is known
    // cannot be corrected afterwards.
    const keyframeNames = usedKf ? resolveKeyframesNames(usedKf) : null;
    const lookupSignature = precompiledEnabled
      ? keyframeLookupSignature(keyframeNames)
      : '';
    const keyframeKeys =
      usedKf && keyframeNames
        ? holdKeyframes(usedKf, keyframeNames, { root })
        : null;

    for (const [chunkName, chunkStyleKeys] of chunkMap) {
      const chunk = processChunkSync(
        resolved,
        chunkName,
        chunkStyleKeys,
        stableStyles,
        root,
        keyframeNames,
        lookupSignature,
        clientInjector,
        precompiledEnabled,
      );
      if (chunk) chunks.push(chunk);
    }

    // Only the classes whose rules actually name the animation own it — one
    // that merely rendered alongside would keep it alive for its own lifetime.
    // The reference is taken once however many times this renders, and released
    // when the last owner is collected.
    if (keyframeKeys) {
      for (const chunk of chunks) {
        for (const authored of chunk.animations ?? []) {
          const key = keyframeKeys.get(authored);
          if (key) ownKeyframes(key, chunk.className, { root });
        }
      }
    }

    for (const chunk of chunks) {
      touch(chunk.className, { root });
    }
  }

  if (chunks.length === 0) return EMPTY_RESULT;
  if (chunks.length === 1) return { className: chunks[0].className };

  return { className: chunks.map((c) => c.className).join(' ') };
}
