import { useContext, useInsertionEffect, useMemo, useRef } from 'react';

import { keyframes } from '../injector';
import type { KeyframesResult, KeyframesSteps } from '../injector/types';
import type { ServerStyleCollector } from '../ssr/collector';
import { TastySSRContext } from '../ssr/context';
import { formatKeyframesCSS } from '../ssr/format-keyframes';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseKeyframesOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

function resolveSSRCollector(
  reactContext: ServerStyleCollector | null,
): ServerStyleCollector | null {
  if (reactContext) return reactContext;
  return getRegisteredSSRCollector();
}

/**
 * Hook to inject CSS @keyframes and return the generated animation name.
 * Handles keyframes injection with proper cleanup on unmount or dependency changes.
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
  const ssrContextValue = useContext(TastySSRContext);
  const ssrCollector = resolveSSRCollector(ssrContextValue);

  // Detect which overload is being used
  const isFactory = typeof stepsOrFactory === 'function';

  // Parse arguments based on overload
  const deps =
    isFactory && Array.isArray(depsOrOptions) ? depsOrOptions : undefined;
  const opts = isFactory
    ? options
    : (depsOrOptions as UseKeyframesOptions | undefined);

  // Memoize the keyframes steps to get a stable reference
  const stepsData = useMemo(
    () => {
      const steps = isFactory
        ? (stepsOrFactory as () => KeyframesSteps)()
        : (stepsOrFactory as KeyframesSteps);

      if (!steps || Object.keys(steps).length === 0) {
        return null;
      }

      return steps;
    },

    isFactory ? (deps ?? []) : [stepsOrFactory],
  );

  // Store keyframes results for cleanup (client only)
  const renderResultRef = useRef<KeyframesResult | null>(null);
  const effectResultRef = useRef<KeyframesResult | null>(null);

  const name = useMemo(() => {
    if (!stepsData) {
      return '';
    }

    // SSR path: format and collect, return name without DOM injection
    if (ssrCollector) {
      const actualName = ssrCollector.allocateKeyframeName(opts?.name);
      const css = formatKeyframesCSS(actualName, stepsData);
      ssrCollector.collectKeyframes(actualName, css);
      return actualName;
    }

    // Client path: inject keyframes synchronously for immediate name availability
    renderResultRef.current?.dispose();
    renderResultRef.current = null;

    const result = keyframes(stepsData, {
      name: opts?.name,
      root: opts?.root,
    });

    renderResultRef.current = result;

    return result.toString();
  }, [stepsData, opts?.name, opts?.root, ssrCollector]);

  // Client path: handle Strict Mode double-invocation and cleanup
  useInsertionEffect(() => {
    effectResultRef.current?.dispose();
    effectResultRef.current = null;

    if (stepsData) {
      const result = keyframes(stepsData, {
        name: opts?.name,
        root: opts?.root,
      });
      effectResultRef.current = result;
    }

    return () => {
      effectResultRef.current?.dispose();
      effectResultRef.current = null;
      renderResultRef.current?.dispose();
      renderResultRef.current = null;
    };
  }, [stepsData, opts?.name, opts?.root]);

  return name;
}
