/**
 * Name prefix utilities for generated identifiers.
 *
 * Tasty generates three kinds of identifiers from content hashes:
 * - class names (used in DOM `class` attribute)
 * - keyframe names (used in CSS `animation`)
 * - counter-style names (used in CSS `list-style-type`)
 *
 * All three derive from a single configurable prefix so that an app
 * can namespace every identifier under one string. Discriminator letters
 * (`k`, `c`) keep the three kinds visually distinct in devtools — they
 * are not required for correctness (CSS keeps these in separate
 * namespaces), only for readability.
 *
 * The runtime / SSR / RSC paths must agree on the prefix; otherwise the
 * client-side hash for a given style will not match the server-rendered
 * class and hydration breaks. The zero-runtime build path uses a
 * different default (`'ts'`) so its classes can't collide with runtime
 * (`'t'`) classes when both are loaded on the same page.
 */

/** Default prefix used by the runtime / SSR / RSC paths. */
export const DEFAULT_NAME_PREFIX = 't';

/** Default prefix used by the zero-runtime (`tastyStatic`) build path. */
export const DEFAULT_ZERO_NAME_PREFIX = 'ts';

/**
 * Allowed shape: starts with a letter or underscore, then letters/
 * digits/underscore/hyphen. Length capped at 32 to keep generated
 * names sane. Matches the CSS identifier rules for the common case
 * while keeping the surface conservative.
 */
const NAME_PREFIX_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$/;

/**
 * Validate a `namePrefix` value.
 * Throws a TypeError with a descriptive message on invalid input so
 * misconfiguration fails loudly at `configure()` time rather than
 * surfacing later as broken hydration.
 */
export function validateNamePrefix(prefix: unknown): void {
  if (typeof prefix !== 'string') {
    throw new TypeError(
      `[Tasty] namePrefix must be a string, got ${typeof prefix}.`,
    );
  }
  if (!NAME_PREFIX_PATTERN.test(prefix)) {
    throw new TypeError(
      `[Tasty] namePrefix "${prefix}" is invalid. ` +
        `It must start with a letter (a-z, A-Z) or "_", contain only ` +
        `letters, digits, "_" or "-", and be 1-32 characters long. ` +
        `Examples: "t", "ts", "myapp-", "_foo".`,
    );
  }
}

/**
 * Build a class name: `${prefix}${hash}`.
 * The hash is appended verbatim — supply a separator inside the prefix
 * itself if you want one (e.g. `'myapp-'`).
 */
export function makeClassName(prefix: string, hash: string): string {
  return `${prefix}${hash}`;
}

/**
 * Build a keyframe name: `${prefix}k${suffix}`.
 * The `k` discriminator keeps keyframe names visually distinct from
 * class names sharing the same prefix. `suffix` is typically a content
 * hash but may be a counter for ad-hoc allocation.
 */
export function makeKeyframeName(prefix: string, suffix: string): string {
  return `${prefix}k${suffix}`;
}

/**
 * Build a counter-style name: `${prefix}c${suffix}`.
 * The `c` discriminator keeps counter-style names visually distinct
 * from class names sharing the same prefix.
 */
export function makeCounterStyleName(prefix: string, suffix: string): string {
  return `${prefix}c${suffix}`;
}

/** Escape a string for safe inclusion in a regex literal. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex matching any tasty class for the given prefix.
 * Used by the runtime GC's DOM scan and class-allocation bookkeeping.
 */
export function tastyClassRegex(prefix: string): RegExp {
  return new RegExp(`^${escapeRegex(prefix)}[a-z0-9]+$`);
}

/**
 * Global regex extracting tasty class names from RSC-inlined CSS.
 * Looks for the doubled-specificity pattern `.cls.cls` that
 * `formatRules()` always emits, which makes extraction reliable.
 */
export function rscClassRegexGlobal(prefix: string): RegExp {
  return new RegExp(`\\.(${escapeRegex(prefix)}[a-z0-9]+)\\.\\1`, 'g');
}
