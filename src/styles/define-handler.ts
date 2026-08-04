import type {
  RawStyleHandler,
  ResolvedStyleValue,
  StyleHandlerResult,
} from '../utils/styles';

/**
 * Declare a multi-dependency style handler with its dependency names inferred
 * into the handler's parameter type.
 *
 * Without it, the multi-dependency tuple form needs a hand-written parameter
 * annotation that can silently drift from the dependency list:
 *
 * ```ts
 * // Annotation and dependency list are maintained separately.
 * handlers: {
 *   spacing: [['gap', 'padding'], ({ gap, padding }: { gap?: string; padding?: string }) => …],
 * }
 *
 * // Both come from the same array; a typo in the destructure is a type error.
 * handlers: {
 *   spacing: defineHandler(['gap', 'padding'], ({ gap, padding }) => …),
 * }
 * ```
 *
 * Values arrive **state-resolved but unparsed** — the raw authored DSL string
 * (`'2x'`, `'#purple.5'`), so call `parseStyle()` / `parseColor()` as needed. The
 * result is a kebab-case CSS declaration map (or an array of them); the reserved
 * `$` key applies the declarations to a nested selector.
 *
 * All names must belong to the same chunk. Names the built-in chunk lists don't
 * know are pulled into their handler's chunk automatically at registration.
 */
export function defineHandler<const TDeps extends readonly string[]>(
  deps: TDeps,
  handler: (
    props: Partial<Record<TDeps[number], ResolvedStyleValue>>,
  ) => StyleHandlerResult,
): [readonly string[], RawStyleHandler] {
  return [deps, handler as RawStyleHandler];
}
