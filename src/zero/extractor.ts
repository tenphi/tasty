import { createHash } from 'crypto';

import {
  categorizeStyleKeys,
  generateChunkCacheKey,
  renderStylesForChunk,
} from '../chunks';
import type {
  CounterStyleDescriptors,
  FontFaceDescriptors,
  FontFaceInput,
  FunctionDefinition,
  KeyframesSteps,
} from '../injector/types';
import {
  extractLocalCounterStyle,
  formatCounterStyleRule,
  hasLocalCounterStyle,
} from '../counter-style';
import {
  extractLocalFontFace,
  formatFontFaceRule,
  hasLocalFontFace,
} from '../font-face';
import {
  extractLocalFunctions,
  formatFunctionRule,
  hasLocalFunctions,
  parseFunctionName,
} from '../functions';
import {
  extractAnimationNamesFromStyles,
  extractLocalKeyframes,
  filterUsedKeyframes,
  hasLocalKeyframes,
  mergeKeyframes,
} from '../keyframes';
import type { StyleResult } from '../pipeline';
import { renderStyles } from '../pipeline';
import { extractLocalProperties, hasLocalProperties } from '../properties';
import { PropertyTypeResolver } from '../properties/property-type-resolver';
import type { Styles } from '../styles/types';
import {
  DEFAULT_ZERO_NAME_PREFIX,
  makeClassName,
  makeKeyframeName,
  validateNamePrefix,
} from '../utils/name-prefix';

export interface ExtractedChunk {
  className: string;
  css: string;
}

export interface ExtractedSelector {
  selector: string;
  css: string;
}

export interface ExtractedKeyframes {
  name: string;
  css: string;
}

interface KeyframesExtractionResult {
  /** Keyframes to inject (deduplicated by content) */
  keyframes: ExtractedKeyframes[];
  /** Map from original animation name to canonical name (for replacement) */
  nameMap: Map<string, string>;
}

/**
 * Module-level prefix used by the zero-runtime extractor.
 * Defaults to `'ts'` so static classes never collide with the runtime
 * `'t'` classes when both are loaded on the same page. Override via
 * `setExtractorNamePrefix()` from the Babel plugin so user config flows
 * into the extractor.
 */
let currentNamePrefix: string = DEFAULT_ZERO_NAME_PREFIX;

/**
 * Set the prefix used by the zero-runtime extractor.
 * Called by the Babel plugin after resolving user config so that
 * generated class and keyframe names match the user's configuration.
 */
export function setExtractorNamePrefix(prefix: string): void {
  validateNamePrefix(prefix);
  currentNamePrefix = prefix;
}

/**
 * Get the prefix currently used by the zero-runtime extractor.
 * Exposed primarily for tests.
 */
export function getExtractorNamePrefix(): string {
  return currentNamePrefix;
}

/**
 * Generate a deterministic className from a cache key using content hash.
 * This ensures the same styles always produce the same className,
 * regardless of build order or incremental compilation.
 */
function generateClassName(cacheKey: string): string {
  const hash = createHash('md5').update(cacheKey).digest('hex').slice(0, 6);
  return makeClassName(currentNamePrefix, hash);
}

/**
 * Extract styles using chunking (for className mode).
 * Returns multiple classes, one per chunk.
 */
export function extractStylesWithChunks(styles: Styles): ExtractedChunk[] {
  const chunks: ExtractedChunk[] = [];

  // Categorize style keys into chunks
  const chunkMap = categorizeStyleKeys(styles as Record<string, unknown>);

  for (const [chunkName, chunkStyleKeys] of chunkMap) {
    if (chunkStyleKeys.length === 0) continue;

    // Generate cache key for this chunk (used for className hash)
    const cacheKey = generateChunkCacheKey(styles, chunkName, chunkStyleKeys);

    // Render styles for this chunk
    const renderResult = renderStylesForChunk(
      styles,
      chunkName,
      chunkStyleKeys,
    );

    if (renderResult.rules.length === 0) continue;

    // Generate deterministic className from content hash
    const className = generateClassName(cacheKey);
    const selector = `.${className}.${className}`;

    // Format CSS
    const css = formatRulesToCSS(renderResult.rules, selector);

    chunks.push({ className, css });
  }

  return chunks;
}

/**
 * Extract styles for a specific selector (for global/selector mode).
 * Returns a single CSS block.
 */
export function extractStylesForSelector(
  selector: string,
  styles: Styles,
): ExtractedSelector {
  // renderStyles with selector returns StyleResult[] with selectors already applied
  const rules = renderStyles(styles, selector);
  // Format without re-prefixing - rules already have the full selector
  const css = formatRulesDirectly(rules);

  return { selector, css };
}

/**
 * Format StyleResult[] to CSS string.
 * Prefixes each rule's selector with the base selector.
 * Used for chunked styles where rules have relative selectors.
 */
function formatRulesToCSS(rules: StyleResult[], baseSelector: string): string {
  return rules
    .map((rule) => {
      // Handle selector as array (OR conditions) or string
      // Note: renderStyles without className joins array selectors with '|||' placeholder
      const selectorParts = Array.isArray(rule.selector)
        ? rule.selector
        : rule.selector
          ? rule.selector.split('|||')
          : [''];

      // Prefix each selector part with the base selector
      const fullSelector = selectorParts
        .map((part) => {
          // Build selector: [rootPrefix] baseSelector[part]
          let selector: string;

          // If part is empty, just use base selector
          if (!part) {
            selector = baseSelector;
          } else if (part.startsWith(':') || part.startsWith('[')) {
            // If part starts with a pseudo-class or pseudo-element, append to base
            selector = `${baseSelector}${part}`;
          } else if (
            part.startsWith('>') ||
            part.startsWith('+') ||
            part.startsWith('~')
          ) {
            // If part starts with >, +, ~ combinator, append with space
            selector = `${baseSelector}${part}`;
          } else {
            // Otherwise, combine base with part
            selector = `${baseSelector}${part}`;
          }

          // Prepend rootPrefix if present (for @root() states)
          if (rule.rootPrefix) {
            selector = `${rule.rootPrefix} ${selector}`;
          }

          return selector;
        })
        .join(', ');

      let css = `${fullSelector} { ${rule.declarations} }`;

      // Wrap in at-rules (in reverse order for proper nesting)
      if (rule.atRules && rule.atRules.length > 0) {
        for (const atRule of [...rule.atRules].reverse()) {
          css = `${atRule} {\n  ${css}\n}`;
        }
      }

      return css;
    })
    .join('\n\n');
}

/**
 * Format StyleResult[] to CSS string directly without prefixing.
 * Used for global styles where rules already have the full selector.
 */
function formatRulesDirectly(rules: StyleResult[]): string {
  return rules
    .map((rule) => {
      // Prepend rootPrefix if present (for @root() states)
      const selector = rule.rootPrefix
        ? `${rule.rootPrefix} ${rule.selector}`
        : rule.selector;

      let css = `${selector} { ${rule.declarations} }`;

      // Wrap in at-rules (in reverse order for proper nesting)
      if (rule.atRules && rule.atRules.length > 0) {
        for (const atRule of [...rule.atRules].reverse()) {
          css = `${atRule} {\n  ${css}\n}`;
        }
      }

      return css;
    })
    .join('\n\n');
}

// Note: With hash-based className generation, counter management functions
// are no longer needed. ClassNames are deterministic based on content.

/**
 * Generate a deterministic keyframes name from content hash.
 * This ensures the same keyframes content always produces the same name,
 * enabling automatic deduplication across elements and files.
 *
 * Uses the configured prefix with a `k` discriminator so keyframe names
 * stay visually distinct from class names sharing the same prefix.
 */
function generateKeyframesName(steps: KeyframesSteps): string {
  const content = JSON.stringify(steps);
  const hash = createHash('md5').update(content).digest('hex').slice(0, 6);
  return makeKeyframeName(currentNamePrefix, hash);
}

/**
 * Extract keyframes that are used in styles.
 * Merges local @keyframes with global keyframes, filters to only used ones.
 * Generates hash-based names from content for automatic deduplication.
 *
 * @param styles - The styles object (may contain @keyframes and animation properties)
 * @param globalKeyframes - Optional global keyframes from config
 * @returns Keyframes to inject and name mapping for replacement
 */
export function extractKeyframesFromStyles(
  styles: Styles,
  globalKeyframes?: Record<string, KeyframesSteps> | null,
): KeyframesExtractionResult {
  const emptyResult: KeyframesExtractionResult = {
    keyframes: [],
    nameMap: new Map(),
  };

  // Extract animation names from styles
  const usedNames = extractAnimationNamesFromStyles(styles);
  if (usedNames.size === 0) return emptyResult;

  // Merge local and global keyframes
  const local = hasLocalKeyframes(styles)
    ? extractLocalKeyframes(styles)
    : null;
  const allKeyframes = mergeKeyframes(local, globalKeyframes ?? null);

  // Filter to only used keyframes
  const usedKeyframes = filterUsedKeyframes(allKeyframes, usedNames);
  if (!usedKeyframes) return emptyResult;

  // Generate hash-based names and collect unique keyframes
  const seenHashes = new Set<string>();
  const nameMap = new Map<string, string>();
  const keyframesToEmit: ExtractedKeyframes[] = [];

  for (const [originalName, steps] of Object.entries(usedKeyframes)) {
    const hashedName = generateKeyframesName(steps);

    // Always map original name to hashed name (for CSS replacement)
    nameMap.set(originalName, hashedName);

    // Only emit each unique keyframe once
    if (!seenHashes.has(hashedName)) {
      seenHashes.add(hashedName);
      const css = keyframesToCSS(hashedName, steps);
      keyframesToEmit.push({ name: hashedName, css });
    }
  }

  return { keyframes: keyframesToEmit, nameMap };
}

/**
 * Convert keyframes steps to CSS string.
 */
function keyframesToCSS(name: string, steps: KeyframesSteps): string {
  const stepRules: string[] = [];

  for (const [key, value] of Object.entries(steps)) {
    if (typeof value === 'string') {
      // Raw CSS string
      stepRules.push(`${key} { ${value.trim()} }`);
    } else if (value && typeof value === 'object') {
      // Style map - convert to CSS declarations
      const declarations = Object.entries(value)
        .map(([prop, val]) => {
          const cssProperty = camelToKebab(prop);
          return `${cssProperty}: ${val}`;
        })
        .join('; ');
      stepRules.push(`${key} { ${declarations} }`);
    }
  }

  return `@keyframes ${name} { ${stepRules.join(' ')} }`;
}

/**
 * Convert camelCase to kebab-case.
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

// ============================================================================
// Property Extraction (auto-infer @property types for zero-runtime)
// ============================================================================

export interface ExtractedProperty {
  name: string;
  css: string;
}

/**
 * Extract auto-inferred @property declarations from styles.
 * Scans rendered style declarations and keyframe declarations for custom properties
 * whose types can be inferred from their values.
 *
 * @param styles - The styles object
 * @param options - Options including autoPropertyTypes flag
 * @returns Array of @property CSS rules to inject
 */
export function extractPropertiesFromStyles(
  styles: Styles,
  options?: { autoPropertyTypes?: boolean },
): ExtractedProperty[] {
  if (options?.autoPropertyTypes === false) return [];

  const registered = new Set<string>();
  const results: ExtractedProperty[] = [];

  // Collect explicitly declared properties (they take precedence)
  if (hasLocalProperties(styles)) {
    const localProps = extractLocalProperties(styles);
    if (localProps) {
      for (const token of Object.keys(localProps)) {
        // Normalize token to CSS name
        let cssName: string;
        if (token.startsWith('#')) {
          cssName = `--${token.slice(1)}-color`;
        } else if (token.startsWith('$')) {
          cssName = `--${token.slice(1)}`;
        } else if (token.startsWith('--')) {
          cssName = token;
        } else {
          cssName = `--${token}`;
        }
        registered.add(cssName);
      }
    }
  }

  const resolver = new PropertyTypeResolver();

  const registerProperty = (
    name: string,
    syntax: string,
    initialValue: string,
  ) => {
    if (registered.has(name)) return;
    registered.add(name);

    const parts: string[] = [];
    parts.push(`syntax: "${syntax}";`);
    parts.push(`inherits: true;`);
    parts.push(`initial-value: ${initialValue};`);

    const css = `@property ${name} { ${parts.join(' ')} }`;
    results.push({ name, css });
  };

  const isPropertyDefined = (name: string) => registered.has(name);

  // Scan rendered style declarations
  const chunkMap = categorizeStyleKeys(styles as Record<string, unknown>);
  for (const [chunkName, chunkStyleKeys] of chunkMap) {
    if (chunkStyleKeys.length === 0) continue;
    const renderResult = renderStylesForChunk(
      styles,
      chunkName,
      chunkStyleKeys,
    );
    for (const rule of renderResult.rules) {
      if (!rule.declarations) continue;
      resolver.scanDeclarations(
        rule.declarations,
        isPropertyDefined,
        registerProperty,
      );
    }
  }

  // Scan keyframe declarations
  if (hasLocalKeyframes(styles)) {
    const localKf = extractLocalKeyframes(styles);
    if (localKf) {
      for (const steps of Object.values(localKf)) {
        scanKeyframeSteps(steps, resolver, isPropertyDefined, registerProperty);
      }
    }
  }

  return results;
}

function scanKeyframeSteps(
  steps: KeyframesSteps,
  resolver: PropertyTypeResolver,
  isPropertyDefined: (name: string) => boolean,
  registerProperty: (
    name: string,
    syntax: string,
    initialValue: string,
  ) => void,
): void {
  for (const value of Object.values(steps)) {
    if (typeof value === 'string') {
      resolver.scanDeclarations(value, isPropertyDefined, registerProperty);
    } else if (value && typeof value === 'object') {
      const declarations = Object.entries(value)
        .map(([prop, val]) => {
          const cssProperty = camelToKebab(prop);
          return `${cssProperty}: ${val}`;
        })
        .join('; ');
      resolver.scanDeclarations(
        declarations,
        isPropertyDefined,
        registerProperty,
      );
    }
  }
}

// ============================================================================
// Font Face Extraction (zero-runtime)
// ============================================================================

export interface ExtractedFontFace {
  css: string;
}

/**
 * Extract @font-face rules from styles, merging with global config.
 * Deduplicates by content hash.
 */
export function extractFontFaceFromStyles(
  styles: Styles,
  globalFontFace?: Record<string, FontFaceInput> | null,
): ExtractedFontFace[] {
  const results: ExtractedFontFace[] = [];
  const seenHashes = new Set<string>();

  function addFontFace(family: string, input: FontFaceInput) {
    const descriptors: FontFaceDescriptors[] = Array.isArray(input)
      ? input
      : [input];
    for (const desc of descriptors) {
      const hash = createHash('md5')
        .update(JSON.stringify({ family, ...desc }))
        .digest('hex')
        .slice(0, 8);
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        results.push({ css: formatFontFaceRule(family, desc) });
      }
    }
  }

  // Global font faces first
  if (globalFontFace) {
    for (const [family, input] of Object.entries(globalFontFace)) {
      addFontFace(family, input);
    }
  }

  // Local font faces (override globals with same hash)
  if (hasLocalFontFace(styles)) {
    const local = extractLocalFontFace(styles);
    if (local) {
      for (const [family, input] of Object.entries(local)) {
        addFontFace(family, input);
      }
    }
  }

  return results;
}

// ============================================================================
// Counter Style Extraction (zero-runtime)
// ============================================================================

export interface ExtractedCounterStyle {
  name: string;
  css: string;
}

/**
 * Extract @counter-style rules from styles, merging with global config.
 * Deduplicates by name (first definition wins).
 */
export function extractCounterStyleFromStyles(
  styles: Styles,
  globalCounterStyle?: Record<string, CounterStyleDescriptors> | null,
): ExtractedCounterStyle[] {
  const results: ExtractedCounterStyle[] = [];
  const seenNames = new Set<string>();

  function addCounterStyle(name: string, descriptors: CounterStyleDescriptors) {
    if (!seenNames.has(name)) {
      seenNames.add(name);
      results.push({ name, css: formatCounterStyleRule(name, descriptors) });
    }
  }

  // Global counter styles first
  if (globalCounterStyle) {
    for (const [name, descriptors] of Object.entries(globalCounterStyle)) {
      addCounterStyle(name, descriptors);
    }
  }

  // Local counter styles (override globals with same name)
  if (hasLocalCounterStyle(styles)) {
    const local = extractLocalCounterStyle(styles);
    if (local) {
      for (const [name, descriptors] of Object.entries(local)) {
        addCounterStyle(name, descriptors);
      }
    }
  }

  return results;
}

// ============================================================================
// Function Extraction (zero-runtime)
// ============================================================================

export interface ExtractedFunction {
  name: string;
  css: string;
}

/**
 * Extract @function rules from styles, merging with global config.
 * Deduplicates by CSS function name (first definition wins).
 */
export function extractFunctionsFromStyles(
  styles: Styles,
  globalFunction?: Record<string, FunctionDefinition> | null,
): ExtractedFunction[] {
  const results: ExtractedFunction[] = [];
  const seenNames = new Set<string>();

  function addFunction(name: string, definition: FunctionDefinition) {
    const cssName = parseFunctionName(name);
    if (!seenNames.has(cssName)) {
      seenNames.add(cssName);
      results.push({
        name: cssName,
        css: formatFunctionRule(name, definition),
      });
    }
  }

  // Global functions first
  if (globalFunction) {
    for (const [name, definition] of Object.entries(globalFunction)) {
      addFunction(name, definition);
    }
  }

  // Local functions (override globals with same name)
  if (hasLocalFunctions(styles)) {
    const local = extractLocalFunctions(styles);
    if (local) {
      for (const [name, definition] of Object.entries(local)) {
        addFunction(name, definition);
      }
    }
  }

  return results;
}
