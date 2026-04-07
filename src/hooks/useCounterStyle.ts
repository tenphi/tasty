import { getGlobalInjector } from '../config';
import { formatCounterStyleRule } from '../counter-style';
import type { CounterStyleDescriptors } from '../injector/types';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';

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
 */
export function useCounterStyle(
  descriptors: CounterStyleDescriptors,
  options?: UseCounterStyleOptions,
): string {
  if (!descriptors || !descriptors.system) {
    return '';
  }

  const target = getStyleTarget();

  if (target.mode === 'ssr') {
    const actualName = target.collector.allocateCounterStyleName(options?.name);
    const css = formatCounterStyleRule(actualName, descriptors);
    target.collector.collectCounterStyle(actualName, css);
    return actualName;
  }

  if (target.mode === 'rsc') {
    const serializedContent = JSON.stringify(descriptors);
    const key = `__cs:${options?.name ?? ''}:${serializedContent}`;

    const existingName = target.cache.generatedNames.get(key);
    if (existingName) return existingName;

    const actualName =
      options?.name ?? `cs${target.cache.counterStyleCounter++}`;
    const css = formatCounterStyleRule(actualName, descriptors);
    pushRSCCSS(target.cache, key, css);
    target.cache.generatedNames.set(key, actualName);
    return actualName;
  }

  // Client path: stable name via content-based dedup
  const serializedContent = JSON.stringify(descriptors);
  const cacheKey = `${options?.name ?? ''}:${serializedContent}`;

  const existingName = clientContentToName.get(cacheKey);
  if (existingName) {
    return existingName;
  }

  const name = options?.name ?? `cs${clientCounterStyleCounter++}`;
  clientContentToName.set(cacheKey, name);

  const injector = getGlobalInjector();
  injector.counterStyle(name, descriptors, { root: options?.root });

  return name;
}
