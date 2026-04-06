import {
  getConfig,
  getGlobalInjector,
  isTestEnvironment,
  markStylesGenerated,
} from '../config';
import type { StyleResult } from '../pipeline';

import { StyleInjector } from './injector';
import type {
  CounterStyleDescriptors,
  FontFaceDescriptors,
  GCOptions,
  GlobalInjectResult,
  InjectResult,
  KeyframesResult,
  KeyframesSteps,
  StyleInjectorConfig,
} from './types';

/**
 * Inject styles and return className with dispose function
 */
export function inject(
  rules: StyleResult[],
  options?: { root?: Document | ShadowRoot; cacheKey?: string },
): InjectResult {
  const injector = getGlobalInjector();

  markStylesGenerated();

  return injector.inject(rules, options);
}

/**
 * Inject global rules that should not reserve tasty class names
 */
export function injectGlobal(
  rules: StyleResult[],
  options?: { root?: Document | ShadowRoot },
): GlobalInjectResult {
  return getGlobalInjector().injectGlobal(rules, options);
}

/**
 * Inject raw CSS text directly without parsing
 * This is a low-overhead method for injecting raw CSS that doesn't need tasty processing.
 * The CSS is inserted into a separate style element to avoid conflicts with tasty's chunking.
 *
 * @example
 * ```tsx
 * // Inject raw CSS
 * const { dispose } = injectRawCSS(`
 *   body { margin: 0; padding: 0; }
 *   .my-class { color: red; }
 * `);
 *
 * // Later, remove the injected CSS
 * dispose();
 * ```
 */
export function injectRawCSS(
  css: string,
  options?: { root?: Document | ShadowRoot },
): { dispose: () => void } {
  return getGlobalInjector().injectRawCSS(css, options);
}

/**
 * Get raw CSS text for SSR
 */
export function getRawCSSText(options?: {
  root?: Document | ShadowRoot;
}): string {
  return getGlobalInjector().getRawCSSText(options);
}

/**
 * Inject keyframes and return object with toString() and dispose()
 */
export function keyframes(
  steps: KeyframesSteps,
  nameOrOptions?: string | { root?: Document | ShadowRoot; name?: string },
): KeyframesResult {
  return getGlobalInjector().keyframes(steps, nameOrOptions);
}

export interface PropertyOptions {
  /**
   * CSS syntax string for the property (e.g., '<color>', '<length>', '<angle>')
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/@property/syntax
   */
  syntax?: string;
  /**
   * Whether the property inherits from parent elements
   * @default true
   */
  inherits?: boolean;
  /**
   * Initial value for the property
   */
  initialValue?: string | number;
  /**
   * Shadow root or document to inject into
   */
  root?: Document | ShadowRoot;
}

/**
 * Define a CSS @property custom property.
 * This enables advanced features like animating custom properties.
 *
 * Note: @property rules are global and persistent once defined.
 * Re-registering the same property name is a no-op.
 *
 * @param name - The custom property name (must start with --)
 * @param options - Property configuration
 *
 * @example
 * ```ts
 * // Define a color property that can be animated
 * property('--my-color', {
 *   syntax: '<color>',
 *   initialValue: 'red',
 * });
 *
 * // Define an angle property
 * property('--rotation', {
 *   syntax: '<angle>',
 *   inherits: false,
 *   initialValue: '0deg',
 * });
 * ```
 */
export function property(name: string, options?: PropertyOptions): void {
  return getGlobalInjector().property(name, options);
}

/**
 * Check if a CSS @property has already been defined
 *
 * @param name - The custom property name to check
 * @param options - Options including root
 */
export function isPropertyDefined(
  name: string,
  options?: { root?: Document | ShadowRoot },
): boolean {
  return getGlobalInjector().isPropertyDefined(name, options);
}

/**
 * Inject a CSS @font-face rule.
 *
 * Permanent and global — no dispose or ref-counting.
 * Deduplicates by content hash (family + descriptors).
 */
export function fontFace(
  family: string,
  descriptors: FontFaceDescriptors,
  options?: { root?: Document | ShadowRoot },
): void {
  return getGlobalInjector().fontFace(family, descriptors, options);
}

/**
 * Inject a CSS @counter-style rule.
 *
 * Permanent and global — no dispose or ref-counting.
 * Deduplicates by name (first definition wins).
 */
export function counterStyle(
  name: string,
  descriptors: CounterStyleDescriptors,
  options?: { root?: Document | ShadowRoot },
): void {
  return getGlobalInjector().counterStyle(name, descriptors, options);
}

/**
 * Get CSS text from all sheets (for SSR)
 */
export function getCssText(options?: { root?: Document | ShadowRoot }): string {
  return getGlobalInjector().getCssText(options);
}

/**
 * Collect only CSS used by a rendered subtree (like jest-styled-components).
 * Pass the container returned by render(...).
 */
export function getCssTextForNode(
  node: ParentNode | Element | DocumentFragment,
  options?: { root?: Document | ShadowRoot },
): string {
  // Collect tasty-generated class names (t<number>) from the subtree
  const classSet = new Set<string>();

  const readClasses = (el: Element) => {
    const cls = el.getAttribute('class');
    if (!cls) return;
    for (const token of cls.split(/\s+/)) {
      if (/^t\d+$/.test(token)) classSet.add(token);
    }
  };

  // Include node itself if it's an Element
  if ((node as Element).getAttribute) {
    readClasses(node as Element);
  }
  // Walk descendants
  const elements = (node as ParentNode).querySelectorAll
    ? (node as ParentNode).querySelectorAll('[class]')
    : ([] as unknown as NodeListOf<Element>);
  if (elements) elements.forEach(readClasses);

  return getGlobalInjector().getCssTextForClasses(classSet, options);
}

/**
 * Force cleanup of unused rules
 */
export function cleanup(root?: Document | ShadowRoot): void {
  return getGlobalInjector().cleanup(root);
}

/**
 * Record a render-time usage hit for one or more classNames.
 * Used internally by computeStyles and tasty() to track style popularity for GC.
 */
export function touch(
  className: string,
  options?: { root?: Document | ShadowRoot },
): void {
  if (!getConfig().gc) return;
  getGlobalInjector().touch(className, options);
}

/**
 * Synchronous garbage collection of unused styles.
 * Scans the DOM for live classNames (never evicts them), then evicts
 * absent styles whose age exceeds their popularity-weighted TTL.
 *
 * @returns Number of styles evicted.
 */
export function gc(options?: GCOptions): number {
  return getGlobalInjector().gc(options);
}

/**
 * Event-driven GC with cooldown.
 * Skips if called within the configured cooldown of the last run.
 * Schedules via requestIdleCallback when available.
 */
export function maybeGC(options?: GCOptions): void {
  return getGlobalInjector().maybeGC(options);
}

/**
 * Check if we're currently running in a test environment
 */
export function getIsTestEnvironment(): boolean {
  return isTestEnvironment();
}

/**
 * Get the global injector instance for debugging
 */
export const injector = {
  get instance() {
    return getGlobalInjector();
  },
};

/**
 * Destroy all resources and clean up
 */
export function destroy(root?: Document | ShadowRoot): void {
  return getGlobalInjector().destroy(root);
}

/**
 * Create a new isolated injector instance
 */
export function createInjector(
  config: Partial<StyleInjectorConfig> = {},
): StyleInjector {
  const defaultConfig = getConfig();

  const fullConfig: StyleInjectorConfig = {
    ...defaultConfig,
    // Auto-enable forceTextInjection in test environments
    forceTextInjection: config.forceTextInjection ?? isTestEnvironment(),
    ...config,
  };

  return new StyleInjector(fullConfig);
}

// Re-export types
export type {
  StyleInjectorConfig,
  InjectResult,
  DisposeFunction,
  RuleInfo,
  SheetInfo,
  RootRegistry,
  StyleRule,
  KeyframesInfo,
  KeyframesResult,
  KeyframesSteps,
  KeyframesCacheEntry,
  CacheMetrics,
  RawCSSResult,
  PropertyDefinition,
  FontFaceDescriptors,
  FontFaceInput,
  CounterStyleDescriptors,
  StyleUsage,
  GCConfig,
  GCOptions,
} from './types';

export { StyleInjector } from './injector';
export { SheetManager } from './sheet-manager';
