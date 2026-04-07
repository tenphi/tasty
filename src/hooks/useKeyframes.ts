import { keyframes } from '../injector';
import type { KeyframesSteps } from '../injector/types';
import { getRSCCache, isRSCEnvironment, pushRSCCSS } from '../rsc-cache';
import { formatKeyframesCSS } from '../ssr/format-keyframes';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseKeyframesOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

const clientContentToName = new Map<string, string>();

/* @internal — used only for tests */
export function _resetKeyframesCache(): void {
  clientContentToName.clear();
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

  const opts = isFactory
    ? options
    : (depsOrOptions as UseKeyframesOptions | undefined);

  const steps = isFactory
    ? (stepsOrFactory as () => KeyframesSteps)()
    : (stepsOrFactory as KeyframesSteps);

  if (!steps || Object.keys(steps).length === 0) {
    return '';
  }

  const ssrCollector = getRegisteredSSRCollector();

  if (ssrCollector) {
    const actualName = ssrCollector.allocateKeyframeName(opts?.name);
    const css = formatKeyframesCSS(actualName, steps);
    ssrCollector.collectKeyframes(actualName, css);
    return actualName;
  }

  if (isRSCEnvironment()) {
    const rscCache = getRSCCache();
    const contentHash = JSON.stringify(steps);
    const key = `__kf:${contentHash}`;

    const existingName = rscCache.generatedNames.get(key);
    if (existingName) return existingName;

    const actualName = opts?.name ?? `k${rscCache.keyframesCounter++}`;
    const css = formatKeyframesCSS(actualName, steps);
    pushRSCCSS(rscCache, key, css);
    rscCache.generatedNames.set(key, actualName);
    return actualName;
  }

  // Client path: stable name via content-based dedup
  const contentHash = JSON.stringify(steps);

  const cachedName = clientContentToName.get(contentHash);
  if (cachedName) {
    return cachedName;
  }

  const result = keyframes(steps, {
    name: opts?.name,
    root: opts?.root,
  });

  const name = result.toString();
  clientContentToName.set(contentHash, name);

  return name;
}
