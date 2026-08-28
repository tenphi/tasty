import { getNamePrefix } from '../config';
import { keyframes } from '../injector';
import type { KeyframesSteps } from '../injector/types';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import { formatKeyframesCSS } from '../ssr/format-keyframes';
import { createClientState } from '../utils/client-state';
import { depsEqual } from '../utils/deps-equal';
import { hashString } from '../utils/hash';
import { makeKeyframeName } from '../utils/name-prefix';

interface UseKeyframesOptions {
  name?: string;
  root?: Document | ShadowRoot;
}

interface FactoryDepsEntry {
  deps: readonly unknown[];
  name: string;
}

interface NamedSlotEntry {
  cacheKey: string;
  dispose: () => void;
}

interface ClientKeyframesState {
  /** cacheKey (name + serialized steps) -> generated animation name */
  contentToName: Map<string, string>;
  /** provided name -> the single injection that slot currently owns */
  namedSlots: Map<string, NamedSlotEntry>;
  /** provided name -> last factory deps, to skip re-evaluating the factory */
  factoryDeps: Map<string, FactoryDepsEntry>;
}

const getClientState = createClientState((): ClientKeyframesState => ({
  contentToName: new Map(),
  namedSlots: new Map(),
  factoryDeps: new Map(),
}));

/**
 * Inject CSS @keyframes and return the generated animation name.
 * Deduplicates by content — identical steps always return the same name.
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * Passing `name` claims a slot owned by that one call site (like `useRawCSS`'s
 * `id`): when its steps change, the previous injection is disposed and the name
 * is reused, so the rules don't accumulate. Anonymous keyframes are permanent
 * and shared by content.
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

  const clientState =
    target.mode === 'client' ? getClientState(opts?.root ?? document) : null;

  // Client deps cache: skip factory re-evaluation when deps haven't changed
  if (isFactory && deps && opts?.name && clientState) {
    const cached = clientState.factoryDeps.get(opts.name);
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

    const actualName =
      opts?.name ??
      makeKeyframeName(getNamePrefix(), hashString(serializedContent));
    const css = formatKeyframesCSS(actualName, steps);
    pushRSCCSS(target.cache, key, css);
    target.cache.generatedNames.set(key, actualName);
    return actualName;
  }

  // Client path: stable name via content-based dedup
  const state = clientState ?? getClientState(opts?.root ?? document);
  const serializedContent = JSON.stringify(steps);
  const cacheKey = `${opts?.name ?? ''}:${serializedContent}`;

  const cachedName = state.contentToName.get(cacheKey);
  if (cachedName) {
    return cachedName;
  }

  const providedName = opts?.name;

  // A named slot owns exactly one injection. When its content changes, drop the
  // previous one first: disposing frees the name so the new steps can reclaim
  // it, and it keeps old @keyframes rules from piling up in the sheet.
  if (providedName) {
    const slot = state.namedSlots.get(providedName);

    if (slot && slot.cacheKey !== cacheKey) {
      slot.dispose();
      // Forget the stale content too, so any other call site still passing the
      // old steps re-injects instead of pointing at a removed rule.
      state.contentToName.delete(slot.cacheKey);
      state.namedSlots.delete(providedName);
    }
  }

  const result = keyframes(steps, {
    name: providedName,
    root: opts?.root,
  });

  const name = result.toString();
  state.contentToName.set(cacheKey, name);

  if (providedName) {
    state.namedSlots.set(providedName, { cacheKey, dispose: result.dispose });

    if (deps) {
      state.factoryDeps.set(providedName, { deps, name });
    }
  }

  return name;
}
