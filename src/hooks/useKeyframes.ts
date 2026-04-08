import { keyframes } from '../injector';
import type { KeyframesSteps } from '../injector/types';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import { formatKeyframesCSS } from '../ssr/format-keyframes';
import { depsEqual } from '../utils/deps-equal';
import { hashString } from '../utils/hash';

interface UseKeyframesOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

const clientContentToName = new Map<string, string>();

interface FactoryDepsEntry {
  deps: readonly unknown[];
  name: string;
}

const factoryDepsCache = new Map<string, FactoryDepsEntry>();

/* @internal — used only for tests */
export function _resetKeyframesCache(): void {
  clientContentToName.clear();
  factoryDepsCache.clear();
}

/**
 * Inject CSS @keyframes and return the generated animation name.
 * Deduplicates by content — identical steps always return the same name.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * @example Basic usage - steps object is the dependency
 * ```tsx
 * function MyComponent() {
 *   const bounce = useKeyframes({
 *     '0%': { transform: 'scale(1)' },
 *     '50%': { transform: 'scale(1.1)' },
 *     '100%': { transform: 'scale(1)' },
 *   });
 *
 *   return <div style={{ animation: `${bounce} 1s infinite` }}>Bouncing</div>;
 * }
 * ```
 *
 * @example With custom name
 * ```tsx
 * function MyComponent() {
 *   const fadeIn = useKeyframes(
 *     { from: { opacity: 0 }, to: { opacity: 1 } },
 *     { name: 'fadeIn' }
 *   );
 *
 *   return <div style={{ animation: `${fadeIn} 0.3s ease-out` }}>Fading in</div>;
 * }
 * ```
 *
 * @example Factory function with dependencies
 * ```tsx
 * function MyComponent({ scale }: { scale: number }) {
 *   const pulse = useKeyframes(
 *     () => ({
 *       '0%': { transform: 'scale(1)' },
 *       '100%': { transform: `scale(${scale})` },
 *     }),
 *     [scale]
 *   );
 *
 *   return <div style={{ animation: `${pulse} 1s infinite` }}>Pulsing</div>;
 * }
 * ```
 */

// Overload 1: Static steps object
export function useKeyframes(
  steps: KeyframesSteps,
  options?: UseKeyframesOptions,
): string;

// Overload 2: Factory function with dependencies
export function useKeyframes(
  factory: () => KeyframesSteps,
  deps: readonly unknown[],
  options?: UseKeyframesOptions,
): string;

// Implementation
export function useKeyframes(
  stepsOrFactory: KeyframesSteps | (() => KeyframesSteps),
  depsOrOptions?: readonly unknown[] | UseKeyframesOptions,
  options?: UseKeyframesOptions,
): string {
  const isFactory = typeof stepsOrFactory === 'function';

  const deps =
    isFactory && Array.isArray(depsOrOptions) ? depsOrOptions : undefined;
  const opts = isFactory
    ? options
    : (depsOrOptions as UseKeyframesOptions | undefined);

  const target = getStyleTarget();

  // Client deps cache: skip factory re-evaluation when deps haven't changed
  if (isFactory && deps && opts?.name && target.mode === 'client') {
    const cached = factoryDepsCache.get(opts.name);
    if (cached && depsEqual(cached.deps, deps)) {
      return cached.name;
    }
  }

  const steps = isFactory
    ? (stepsOrFactory as () => KeyframesSteps)()
    : (stepsOrFactory as KeyframesSteps);

  if (!steps || Object.keys(steps).length === 0) {
    return '';
  }

  if (target.mode === 'ssr') {
    const actualName = target.collector.allocateKeyframeName(opts?.name);
    const css = formatKeyframesCSS(actualName, steps);
    target.collector.collectKeyframes(actualName, css);
    return actualName;
  }

  if (target.mode === 'rsc') {
    const serializedContent = JSON.stringify(steps);
    const key = `__kf:${opts?.name ?? ''}:${serializedContent}`;

    const existingName = target.cache.generatedNames.get(key);
    if (existingName) return existingName;

    const actualName = opts?.name ?? `k${hashString(serializedContent)}`;
    const css = formatKeyframesCSS(actualName, steps);
    pushRSCCSS(target.cache, key, css);
    target.cache.generatedNames.set(key, actualName);
    return actualName;
  }

  // Client path: stable name via content-based dedup
  const serializedContent = JSON.stringify(steps);
  const cacheKey = `${opts?.name ?? ''}:${serializedContent}`;

  const cachedName = clientContentToName.get(cacheKey);
  if (cachedName) {
    return cachedName;
  }

  const result = keyframes(steps, {
    name: opts?.name,
    root: opts?.root,
  });

  const name = result.toString();
  clientContentToName.set(cacheKey, name);

  if (deps && opts?.name) {
    factoryDepsCache.set(opts.name, { deps, name });
  }

  return name;
}
