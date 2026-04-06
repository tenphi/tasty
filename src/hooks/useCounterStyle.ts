import { useInsertionEffect, useMemo } from 'react';

import { getGlobalInjector } from '../config';
import { formatCounterStyleRule } from '../counter-style';
import type { CounterStyleDescriptors } from '../injector/types';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseCounterStyleOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

let clientCounterStyleCounter = 0;

/**
 * Hook to inject a CSS @counter-style rule and return the generated name.
 * Permanent — no cleanup on unmount. Deduplicates by name.
 *
 * @example Basic usage
 * ```tsx
 * function EmojiList() {
 *   const styleName = useCounterStyle({
 *     system: 'cyclic',
 *     symbols: '"👍"',
 *     suffix: '" "',
 *   }, { name: 'thumbs' });
 *
 *   return (
 *     <ol style={{ listStyleType: styleName }}>
 *       <li>First</li>
 *       <li>Second</li>
 *     </ol>
 *   );
 * }
 * ```
 *
 * @example Factory function with dependencies
 * ```tsx
 * function DynamicList({ marker }: { marker: string }) {
 *   const styleName = useCounterStyle(
 *     () => ({
 *       system: 'cyclic',
 *       symbols: `"${marker}"`,
 *       suffix: '" "',
 *     }),
 *     [marker],
 *   );
 *
 *   return <ol style={{ listStyleType: styleName }}>...</ol>;
 * }
 * ```
 */

// Overload 1: Static descriptors
export function useCounterStyle(
  descriptors: CounterStyleDescriptors,
  options?: UseCounterStyleOptions,
): string;

// Overload 2: Factory function with dependencies
export function useCounterStyle(
  factory: () => CounterStyleDescriptors,
  deps: readonly unknown[],
  options?: UseCounterStyleOptions,
): string;

// Implementation
export function useCounterStyle(
  descriptorsOrFactory:
    | CounterStyleDescriptors
    | (() => CounterStyleDescriptors),
  depsOrOptions?: readonly unknown[] | UseCounterStyleOptions,
  options?: UseCounterStyleOptions,
): string {
  const ssrCollector = getRegisteredSSRCollector();

  const isFactory = typeof descriptorsOrFactory === 'function';

  const deps =
    isFactory && Array.isArray(depsOrOptions) ? depsOrOptions : undefined;
  const opts = isFactory
    ? options
    : (depsOrOptions as UseCounterStyleOptions | undefined);

  // Stable key for the static path — avoids re-triggering when caller
  // passes an inline object literal with the same content.
  const inputKey = useMemo(
    () => (isFactory ? null : JSON.stringify(descriptorsOrFactory)),
    [isFactory ? null : descriptorsOrFactory],
  );

  const descriptorsData = useMemo(
    () => {
      const descriptors = isFactory
        ? (descriptorsOrFactory as () => CounterStyleDescriptors)()
        : (descriptorsOrFactory as CounterStyleDescriptors);

      if (!descriptors || !descriptors.system) {
        return null;
      }

      return descriptors;
    },

    isFactory ? (deps ?? []) : [inputKey],
  );

  const name = useMemo(() => {
    if (!descriptorsData) {
      return '';
    }

    // SSR path: format and collect, return name without DOM injection
    if (ssrCollector) {
      const actualName = ssrCollector.allocateCounterStyleName(opts?.name);
      const css = formatCounterStyleRule(actualName, descriptorsData);
      ssrCollector.collectCounterStyle(actualName, css);
      return actualName;
    }

    // Client path: return the name (injection happens in useInsertionEffect)
    return opts?.name ?? `cs${clientCounterStyleCounter++}`;
  }, [descriptorsData, opts?.name, ssrCollector]);

  // Client path: inject via DOM
  useInsertionEffect(() => {
    if (!descriptorsData || !name) return;

    const injector = getGlobalInjector();
    injector.counterStyle(name, descriptorsData, { root: opts?.root });
  }, [descriptorsData, name, opts?.root]);

  return name;
}
