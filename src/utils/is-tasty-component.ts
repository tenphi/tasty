/**
 * Brand applied to every component returned by `tasty()` so the dispatcher
 * can distinguish Tasty-produced components from arbitrary React components
 * (third-party libraries, plain `forwardRef`/`memo` wrappers, string tags).
 *
 * Uses `Symbol.for(...)` so that multiple bundled copies of `@tenphi/tasty`
 * still recognise each other's components — important for monorepos and
 * peer-dep nesting.
 */
export const TASTY_COMPONENT_BRAND: unique symbol = Symbol.for(
  '@tenphi/tasty.component',
);

/**
 * Returns `true` when `value` is a component produced by `tasty()`.
 *
 * Sub-elements created via `createSubElement` are intentionally not branded:
 * they forward `className`/`style` to their underlying tag but do not consume
 * `styles`, so wrapping them must go through the non-Tasty path.
 */
export function isTastyComponent(value: unknown): boolean {
  if (value == null) return false;

  const type = typeof value;
  if (type !== 'function' && type !== 'object') return false;

  return (
    (value as Record<PropertyKey, unknown>)[TASTY_COMPONENT_BRAND] === true
  );
}

/**
 * Marks `value` as a Tasty-produced component. No-op if `value` is not a
 * brandable target (string tags, primitives, etc.).
 */
export function brandTastyComponent<T>(value: T): T {
  if (value == null) return value;

  const type = typeof value;
  if (type !== 'function' && type !== 'object') return value;

  try {
    (value as unknown as Record<PropertyKey, unknown>)[TASTY_COMPONENT_BRAND] =
      true;
  } catch {
    // Frozen/sealed objects: leave unbranded, treat as non-Tasty.
  }

  return value;
}
