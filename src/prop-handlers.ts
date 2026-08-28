/**
 * Props middleware for tasty components.
 *
 * A prop handler receives a component's props and returns them, changed or not.
 * That makes it the extension point for props that are *not* style properties:
 * it can read a custom prop, strip it so it never reaches the DOM, and fold its
 * meaning into `styles`, `mods`, `tokens`, `variant`, or `as`.
 *
 * ```ts
 * configure({
 *   propHandlers: {
 *     glaze: (props) => {
 *       const { glaze, ...rest } = props;
 *       if (!glaze) return rest;
 *       return { ...rest, styles: mergeStyles(glazeStyles(glaze), rest.styles) };
 *     },
 *   },
 * });
 * ```
 *
 * Handlers run on every render of every tasty component, so the registry is a
 * pre-composed chain that is `null` while nothing is registered — the cost when
 * unused is one property load and one branch.
 */

import { isDevEnv } from './utils/is-dev-env';

/** Props object handed to a prop handler. Deliberately untyped: handlers see everything. */
export type PropHandlerProps = Record<string, unknown>;

/**
 * Props middleware: props in, props out. Returning nothing means "unchanged".
 *
 * Must be a **pure function** and must not mutate its input. Style values are
 * cached by object identity, so mutating a value object in place produces a stale
 * class name and stale CSS. Return fresh (ideally frozen, ideally memoized)
 * objects instead.
 */
export type PropHandler = (
  props: PropHandlerProps,
) => PropHandlerProps | void | null;

/**
 * How a prop handler is declared. The map key is both its name and, by default,
 * the prop that triggers it.
 *
 * - `fn` — triggered when a prop matching the key is present
 * - `['glaze', fn]` — triggered by the named prop
 * - `[['glaze', 'tone'], fn]` — triggered by any of them
 * - `['*', fn]` — unconditional; runs on every render of every component
 */
export type PropHandlerDefinition =
  PropHandler | [string, PropHandler] | [string[], PropHandler];

interface NormalizedPropHandler {
  key: string;
  /** Props that trigger this handler, or `null` for unconditional. */
  triggers: string[] | null;
  fn: PropHandler;
  source: string;
}

type PropHandlerChain = (props: PropHandlerProps) => PropHandlerProps;

interface PropHandlerRegistry {
  /** Pre-composed chain, or `null` while nothing is registered. */
  apply: PropHandlerChain | null;
  list: NormalizedPropHandler[];
}

// Held on globalThis so a duplicated module graph (Astro's server/client split)
// shares one registry, matching how the rest of the global config is stored.
const GTKEY = '__tasty_prop_handlers__';

const globalStore = globalThis as unknown as Record<string, unknown>;

export const propHandlerRegistry: PropHandlerRegistry =
  (globalStore[GTKEY] as PropHandlerRegistry | undefined) ??
  ((globalStore[GTKEY] = { apply: null, list: [] }) as PropHandlerRegistry);

export interface RegisterPropHandlerOptions {
  /** Where the handler came from — a plugin name, or `'configure()'`. */
  source?: string;
}

function normalize(
  key: string,
  definition: PropHandlerDefinition,
  options?: RegisterPropHandlerOptions,
): NormalizedPropHandler {
  const source = options?.source ?? 'configure()';

  if (typeof definition === 'function') {
    return { key, triggers: [key], fn: definition, source };
  }

  if (Array.isArray(definition)) {
    const [first, fn] = definition;

    if (typeof fn !== 'function') {
      throw new Error(
        `[Tasty] Invalid prop handler definition for "${key}". ` +
          'Tuple must have a function as the second element: [string, function] or [string[], function].',
      );
    }

    if (first === '*') {
      return { key, triggers: null, fn, source };
    }

    if (typeof first === 'string') {
      return { key, triggers: [first], fn, source };
    }

    if (Array.isArray(first)) {
      return {
        key,
        triggers: first.includes('*') ? null : first,
        fn,
        source,
      };
    }

    throw new Error(
      `[Tasty] Invalid prop handler definition for "${key}". ` +
        'First element must be a string or string array.',
    );
  }

  throw new Error(
    `[Tasty] Invalid prop handler definition for "${key}". ` +
      'Expected function, [string, function], or [string[], function].',
  );
}

/**
 * Run one handler, treating a nothing/non-object return as "unchanged".
 *
 * `isDevEnv()` is called lazily rather than captured at module load so the
 * warnings are assertable in tests; it is only reached on the misuse path.
 */
function runOne(
  handler: NormalizedPropHandler,
  props: PropHandlerProps,
): PropHandlerProps {
  const next = handler.fn(props);

  if (next != null && typeof next === 'object' && !Array.isArray(next)) {
    return next;
  }

  if (isDevEnv()) {
    console.warn(
      next == null
        ? `[Tasty] propHandlers["${handler.key}"] (from ${handler.source}) returned ` +
            `${String(next)}. Props are treated as unchanged — did you forget to ` +
            `\`return props\`?`
        : `[Tasty] propHandlers["${handler.key}"] (from ${handler.source}) returned ` +
            `${Array.isArray(next) ? 'an array' : typeof next}. A prop handler must ` +
            `return a props object. The result was ignored.`,
    );
  }

  return props;
}

function compose(list: NormalizedPropHandler[]): PropHandlerChain | null {
  if (list.length === 0) return null;

  // Specialize the overwhelmingly common single-handler case.
  if (list.length === 1) {
    const only = list[0];

    if (only.triggers === null) {
      return (props) => runOne(only, props);
    }

    if (only.triggers.length === 1) {
      const trigger = only.triggers[0];

      return (props) => (trigger in props ? runOne(only, props) : props);
    }
  }

  return (props) => {
    for (const handler of list) {
      const triggers = handler.triggers;

      if (triggers !== null) {
        let triggered = false;

        for (const trigger of triggers) {
          if (trigger in props) {
            triggered = true;
            break;
          }
        }

        if (!triggered) continue;
      }

      props = runOne(handler, props);
    }

    return props;
  };
}

/**
 * Register a props middleware under `key`, replacing any handler already
 * registered under the same key while keeping its position in the chain.
 */
export function registerPropHandler(
  key: string,
  definition: PropHandlerDefinition,
  options?: RegisterPropHandlerOptions,
): void {
  const normalized = normalize(key, definition, options);
  const { list } = propHandlerRegistry;
  const existing = list.findIndex((handler) => handler.key === key);

  if (existing === -1) {
    list.push(normalized);
  } else {
    list[existing] = normalized;
  }

  propHandlerRegistry.apply = compose(list);
}

/** Drop every registered props middleware. Called by `resetConfig()`. */
export function resetPropHandlers(): void {
  if (propHandlerRegistry.list.length === 0) return;

  // Mutate the holder rather than replacing it: other modules captured this
  // object reference at import time.
  propHandlerRegistry.list.length = 0;
  propHandlerRegistry.apply = null;
}
