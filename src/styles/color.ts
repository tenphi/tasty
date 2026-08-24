import { parseColor, resolveCustomProperties } from '../utils/styles';

/**
 * A color that already resolves against the color the element inherits, and so
 * must not be republished as `--current-color`. Covers both spellings: the
 * variable (a self-reference) and the keyword (a second resolution).
 */
const RE_READS_CURRENT = /var\(--current-color[,)]|currentcolor/i;

export function colorStyle({ color }: { color?: string | boolean }) {
  if (!color) return null;

  if (color === true) color = 'currentColor';

  // Resolve whatever the parser recognizes as a color — a `#token`, a fallback
  // chain, a color function with tokens inside it. Anything else (a keyword, a
  // bare `$name`) is emitted verbatim, so references still need substituting or
  // the raw DSL leaks into the declaration.
  color = parseColor(color, true).color || resolveCustomProperties(color);

  const styles: Record<string, string> = { color };

  // Republish the color as `--current-color` so `#current` resolves to a
  // concrete value rather than the `currentcolor` keyword. Every color is
  // published, not only a named token: `color: 'red'` has to displace an
  // ancestor's token color, or a descendant's `#current` would read the
  // ancestor's and not this element's.
  //
  // A value that already reads the color it inherits is skipped. Publishing
  // `var(--current-color)` into `--current-color` is a self-reference, which
  // invalidates the declaration and silently drops back to the initial value;
  // publishing a `color-mix()` over `currentcolor` would be resolved again at
  // the descendant and fade twice.
  if (!RE_READS_CURRENT.test(color)) {
    styles['--current-color'] = color;
  }

  return styles;
}

colorStyle.__lookupStyles = ['color'];
