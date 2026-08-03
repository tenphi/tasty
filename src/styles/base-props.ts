/**
 * Registry for style properties promoted to base props on every tasty component.
 *
 * `BASE_STYLES` stays a frozen `as const` — a dozen type helpers in `src/types.ts`
 * are derived from it — so `configure({ baseStyleProps })` records the additions
 * here instead. A version counter lets each `tasty()` factory memoize its prop
 * list and refresh only when the registry changes: factories are created at module
 * eval, which can run *before* `configure()`, and `resetConfig()` (plus the
 * zero-runtime Babel worker) reopens configuration, so a one-shot lazy init would
 * go stale.
 */

import { isDevEnv } from '../utils/is-dev-env';

import { BASE_STYLES } from './list';

/** Props consumed by `tasty()` itself, which a style name must never shadow. */
const RESERVED_PROP_NAMES = new Set<string>([
  'as',
  'styles',
  'variant',
  'mods',
  'element',
  'qa',
  'qaVal',
  'className',
  'tokens',
  'style',
  'theme',
  'children',
  'ref',
  'key',
]);

const VALID_NAME = /^[a-z][a-zA-Z0-9]*$/;

interface BaseStylePropsRegistry {
  /** Style names added on top of BASE_STYLES. */
  list: readonly string[];
  /** Bumped on every change; factories compare against it to refresh their memo. */
  version: number;
}

const GTKEY = '__tasty_base_style_props__';

const globalStore = globalThis as unknown as Record<string, unknown>;

export const baseStylePropsRegistry: BaseStylePropsRegistry =
  (globalStore[GTKEY] as BaseStylePropsRegistry | undefined) ??
  ((globalStore[GTKEY] = { list: [], version: 0 }) as BaseStylePropsRegistry);

/**
 * Expose style properties as top-level props on every tasty component, in
 * addition to `BASE_STYLES`.
 *
 * Each name costs one property check per render of every component, forever, so
 * keep the list short. The effect is app-global and cannot be scoped to a subtree;
 * use a factory's own `styleProps` for anything narrower.
 */
export function registerBaseStyleProps(names: readonly string[]): void {
  const added: string[] = [];

  for (const name of names) {
    if (isDevEnv()) {
      if (!VALID_NAME.test(name)) {
        console.warn(
          `[Tasty] baseStyleProps entry "${name}" is invalid. Names must start ` +
            `with a lowercase letter and contain only letters and digits ` +
            `(capitalised names are sub-element selectors, and "@", "$", "#", ` +
            `".", "&", "_" prefixes are reserved).`,
        );
        continue;
      }

      if (RESERVED_PROP_NAMES.has(name)) {
        console.warn(
          `[Tasty] baseStyleProps entry "${name}" collides with a prop tasty() ` +
            `consumes itself and was ignored.`,
        );
        continue;
      }
    } else if (!VALID_NAME.test(name) || RESERVED_PROP_NAMES.has(name)) {
      continue;
    }

    if (
      (BASE_STYLES as readonly string[]).includes(name) ||
      baseStylePropsRegistry.list.includes(name) ||
      added.includes(name)
    ) {
      continue;
    }

    added.push(name);
  }

  if (added.length === 0) return;

  baseStylePropsRegistry.list = baseStylePropsRegistry.list.concat(added);
  baseStylePropsRegistry.version++;
}

/** Style names promoted via `configure({ baseStyleProps })`. */
export function getBaseStyleProps(): readonly string[] {
  return baseStylePropsRegistry.list;
}

/** Drop promoted base style props. Called by `resetConfig()`. */
export function resetBaseStyleProps(): void {
  if (baseStylePropsRegistry.list.length === 0) return;

  baseStylePropsRegistry.list = [];
  // Must bump on reset too, or factory memos keep the stale list.
  baseStylePropsRegistry.version++;
}
