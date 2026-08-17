import { RE_HEX } from '../parser/const';

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (s) => `-${s.toLowerCase()}`);
}

/**
 * Normalize a DSL identifier to the CSS custom-property name it emits.
 *
 * CSS custom-property names are case-sensitive, so `$myVar` has to keep its
 * inner case to reference `--myVar`. A leading capital is the one exception:
 * `$Foo` is not a supported way to name a property, so the first character is
 * folded rather than kebab-cased (`--foo`, not `---foo`) and every later
 * character is left alone.
 *
 * Every place that turns a `$name` / `#name` identifier into a CSS name goes
 * through this, so authoring a token and referencing it always agree.
 */
export function normalizeDslName(name: string): string {
  if (!name) return name;

  const first = name[0];
  const lower = first.toLowerCase();

  return lower === first ? name : lower + name.slice(1);
}

/** A DSL identifier: `$name`, `$$name`, `#name` or `##name`. */
const RE_DSL_IDENTIFIER = /(\$\$?|##?)([a-zA-Z_][a-zA-Z0-9_-]*)/g;

/**
 * Case-fold a DSL string for parsing, preserving the case of custom-property
 * names.
 *
 * Everything the parser matches on — keywords, units, modifiers, function names,
 * color-token names — is compared lowercase, so the whole string used to be
 * lowercased up front. That also folded custom-property names, which are
 * case-sensitive in CSS: `$myVar` referenced `var(--myvar)` while the token
 * definition emitted `--myVar`, so the two could never meet.
 *
 * Identifier bodies now keep their case (their first character still folds, see
 * {@link normalizeDslName}); everything else is lowercased exactly as before.
 * Hex literals are excluded — `#FF0000` is a color, not a name, and must fold to
 * match {@link RE_HEX}.
 */
export function foldDslCase(src: string): string {
  const folded = src.toLowerCase();

  // Fast paths, in the order they pay off: an input that was already lowercase
  // has no case to protect, and one without a sigil has no identifier to protect.
  // Both reduce to the single fold this replaced, so only mixed-case values that
  // actually name a custom property reach the scan below.
  if (folded === src || (!src.includes('$') && !src.includes('#'))) {
    return folded;
  }

  RE_DSL_IDENTIFIER.lastIndex = 0;

  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = RE_DSL_IDENTIFIER.exec(src))) {
    const [whole, prefix, body] = match;

    out += src.slice(last, match.index).toLowerCase();
    out +=
      prefix +
      (prefix[0] === '#' && RE_HEX.test(body.toLowerCase())
        ? body.toLowerCase()
        : normalizeDslName(body));
    last = match.index + whole.length;
  }

  return out + src.slice(last).toLowerCase();
}
