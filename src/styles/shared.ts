import { CSS_WIDE_KEYWORDS } from '../parser/const';
import type { StyleDetails } from '../parser/types';
import { isDevEnv } from '../utils/is-dev-env';

/**
 * If the group contains exactly one value that is a CSS-wide keyword
 * and no colors, return the keyword. Otherwise null.
 *
 * Direction mods (top/right/bottom/left) may coexist with the keyword
 * for directional application like `padding="inherit top"`.
 */
export function extractCSSWideKeyword(group: StyleDetails): string | null {
  if (group.values.length !== 1 || group.colors.length > 0) return null;
  return CSS_WIDE_KEYWORDS.has(group.values[0]) ? group.values[0] : null;
}

/** A resolved custom-property reference, i.e. `var(--name)` or `var(--name, …)`. */
const RE_VAR_REFERENCE = /^var\(/;

/**
 * Assign custom-property references to the style and color slots of a
 * `<line-width> <line-style> <line-color>` shorthand (`border`, `outline`).
 *
 * The parser cannot type a reference, so it buckets `$name` as a plain value and
 * the handler has to place it. A reference fills the first slot still free, in
 * shorthand order: the width takes `values[0]`, then the style, then the color.
 * The style would otherwise arrive as a keyword (`solid`, `dashed`, …) that a
 * reference has no way to match, and the color as `#name` — the `$name-color`
 * form the parser buckets as a color exists to reference a raw CSS custom
 * property, not as the way colors are written, so a reference should not reach
 * for the color slot until the style slot is taken.
 *
 * Lengths are left alone: a second length is not valid in these shorthands, and
 * promoting one would emit an invalid declaration instead of ignoring an extra
 * value. Callers supply their own slot defaults.
 */
export function assignLineSlots(
  values: string[],
  styleKeyword: string | undefined,
  colorToken: string | undefined,
): { style: string | undefined; color: string | undefined } {
  if (styleKeyword && colorToken) {
    return { style: styleKeyword, color: colorToken };
  }

  // A `$name-color` reference is filed under both buckets (`Bucket.ColorValue`),
  // so skip the one the color slot already claimed rather than placing it twice.
  const spare = values
    .slice(1)
    .filter((value) => RE_VAR_REFERENCE.test(value) && value !== colorToken);

  return {
    style: styleKeyword || spare.shift(),
    color: colorToken || spare.shift(),
  };
}

/** Warning keys already emitted, so each distinct offending value warns once. */
const emittedWarnings = new Set<string>();

/** A resolved custom-property reference anywhere in a token. */
const RE_HAS_VAR_REFERENCE = /var\(/;

/**
 * Reject a custom-property reference used where a *token name* is expected.
 *
 * `preset` and `transition` take the name of a design token (`t3`, `fill`) and
 * interpolate it into a CSS custom property — `var(--t3-font-size)`. A reference
 * substituted into that position builds `var(--var(--x)-font-size)`, which is not
 * a valid custom-property name, so the browser drops the declaration and the
 * style silently does nothing. The DSL has no way to indirect a token name
 * through a custom property: the name is needed at build time, and a reference
 * only resolves in the browser.
 *
 * Returns true (warning once per value in dev) so the caller can fall back
 * instead of emitting a declaration that cannot work.
 */
export function isTokenNameReference(property: string, name: string): boolean {
  if (!RE_HAS_VAR_REFERENCE.test(name)) return false;

  warnOnceDev(
    `token-name-reference:${property}:${name}`,
    `${property}="${name}": a custom property cannot name a token. The name is ` +
      `interpolated into a CSS custom property at build time, so a reference ` +
      `would build an unusable name. It is ignored.`,
  );

  return true;
}

/**
 * Emit a style-level warning at most once per `key`. No-op outside dev mode.
 *
 * Style handlers run once per state combination and their results are cached,
 * but the same value can arrive from many components, so dedupe is required.
 *
 * `isDevEnv()` is called lazily rather than captured at module load (the pattern
 * used in `config.ts` and `states/index.ts`) so that tests can enable it with
 * `vi.stubEnv('NODE_ENV', 'development')` — `isDevEnv()` returns `false` for
 * `NODE_ENV=test`, which is why every module-load-gated warning in this repo is
 * currently untestable. The key is registered *before* the dev check, so
 * production pays at most one `isDevEnv()` call per distinct offending value and
 * never touches the console.
 */
export function warnOnceDev(key: string, message: string): void {
  if (emittedWarnings.has(key)) return;
  emittedWarnings.add(key);

  if (!isDevEnv()) return;

  console.warn(`[Tasty] ${message}`);
}

/** Forget emitted style warnings. Called by `resetConfig()`; test isolation. */
export function resetStyleWarnings(): void {
  emittedWarnings.clear();
}

/**
 * Report a comma group that names direction modifiers together with more values
 * than the group can use.
 *
 * The parser buckets values and modifiers into separate arrays per comma group,
 * so `padding: '2x 4x top right'`, `padding: '2x top 4x right'` and
 * `padding: 'top 2x right 4x'` all reach a handler identically — the pairing a
 * reader infers from source order does not survive parsing. Such a group
 * therefore carries a single value, applied to every direction it names.
 *
 * `maxValues` is 2 only for a span modifier (`inset: '2x 4x bottom dock'`),
 * where the second value insets the sides the dock spans.
 *
 * Callers must guard on the count themselves so the valid path costs one integer
 * comparison; everything expensive happens here, on the misuse path only.
 */
export function warnExtraGroupValues(
  property: string,
  input: string,
  maxValues: 1 | 2,
): void {
  const message =
    maxValues === 2
      ? `${property}="${input}": with a span modifier a group takes at most two ` +
        `values — one for the named edge and one for the spanned sides. ` +
        `The extra values are ignored.`
      : `${property}="${input}": a group that names directions takes a single ` +
        `value, applied to every direction it names. The extra values are ` +
        `ignored — use comma-separated groups instead, ` +
        `e.g. ${property}="2x top, 4x right".`;

  warnOnceDev(`extra-values:${property}:${input}`, message);
}
