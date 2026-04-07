import { getGlobalInjector } from '../config';
import { formatCounterStyleRule } from '../counter-style';
import type { CounterStyleDescriptors } from '../injector/types';
import { getRSCCache, isServerEnvironment, pushRSCCSS } from '../rsc-cache';
import { getRegisteredSSRCollector } from '../ssr/ssr-collector-ref';

interface UseCounterStyleOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

let clientCounterStyleCounter = 0;

const clientContentToName = new Map<string, string>();

/* @internal — used only for tests */
export function _resetCounterStyleCache(): void {
  clientContentToName.clear();
  clientCounterStyleCounter = 0;
}

/**
 * Inject a CSS @counter-style rule and return the generated name.
 * Permanent — no cleanup on unmount. Deduplicates by name.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
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
  const isFactory = typeof descriptorsOrFactory === 'function';

  const opts = isFactory
    ? options
    : (depsOrOptions as UseCounterStyleOptions | undefined);

  const descriptors = isFactory
    ? (descriptorsOrFactory as () => CounterStyleDescriptors)()
    : (descriptorsOrFactory as CounterStyleDescriptors);

  if (!descriptors || !descriptors.system) {
    return '';
  }

  const ssrCollector = getRegisteredSSRCollector();

  if (ssrCollector) {
    const actualName = ssrCollector.allocateCounterStyleName(opts?.name);
    const css = formatCounterStyleRule(actualName, descriptors);
    ssrCollector.collectCounterStyle(actualName, css);
    return actualName;
  }

  if (isServerEnvironment()) {
    const rscCache = getRSCCache();
    const contentKey = JSON.stringify(descriptors);
    const key = `__cs:${opts?.name ?? ''}:${contentKey}`;

    const existingName = rscCache.generatedNames.get(key);
    if (existingName) return existingName;

    const actualName = opts?.name ?? `cs${rscCache.counterStyleCounter++}`;
    const css = formatCounterStyleRule(actualName, descriptors);
    pushRSCCSS(rscCache, key, css);
    rscCache.generatedNames.set(key, actualName);
    return actualName;
  }

  // Client path: stable name via content-based dedup
  const contentKey = JSON.stringify(descriptors);
  const cacheKey = `${opts?.name ?? ''}:${contentKey}`;

  const existingName = clientContentToName.get(cacheKey);
  if (existingName) {
    return existingName;
  }

  const name = opts?.name ?? `cs${clientCounterStyleCounter++}`;
  clientContentToName.set(cacheKey, name);

  const injector = getGlobalInjector();
  injector.counterStyle(name, descriptors, { root: opts?.root });

  return name;
}
