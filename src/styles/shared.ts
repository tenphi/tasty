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

/** Warning keys already emitted, so each distinct offending value warns once. */
const emittedWarnings = new Set<string>();

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
