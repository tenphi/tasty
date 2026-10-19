import {
  parseColor,
  parseStyle,
  resolveCustomProperties,
} from '../utils/styles';

/** A `#` followed by hex digits only: a literal, but also a valid token name. */
const RE_HEX_LITERAL = /^#[0-9a-f]+$/i;

/**
 * A color that already resolves against the color the element inherits, and so
 * must not be republished as `--current-color`: a descendant reading the
 * variable would resolve it a second time against its own color. Covers the
 * keyword and the variable alike — the latter would also be a self-reference.
 */
const RE_READS_CURRENT = /var\(--current-color[,)]|currentcolor/i;

export function colorStyle({ color }: { color?: string | boolean }) {
  if (!color) return null;

  if (color === true) color = 'currentColor';

  // Resolve whatever the parser recognizes as a color — a `#token`, a fallback
  // chain, a color function with tokens inside it. Anything else (a keyword, a
  // bare `$name`) is emitted verbatim, so references still need substituting or
  // the raw DSL leaks into the declaration.
  //
  // A hex literal takes the parser's reading, as it does in `fill`, `border`
  // and every other color style: `#ddd` is also a valid token name, so it
  // becomes `var(--ddd-color, #ddd)`. `parseColor()` would pass it through
  // as-is, and a hex-shaped token (`#fade`, `#bad`) would then win everywhere
  // but `color`.
  const resolved = RE_HEX_LITERAL.test(color)
    ? parseStyle(color).groups[0]?.colors[0]
    : parseColor(color, true).color;

  color = resolved || resolveCustomProperties(color);

  const styles: Record<string, string> = { color };

  // Republish the color as `--current-color`, the variable a consumer reads to
  // pick the inherited color up as a *color* rather than as `currentcolor` —
  // usable in hand-authored CSS and anywhere the keyword will not do. `#current`
  // itself does not go through it; the keyword composes and the variable cannot.
  //
  // Every color is published, not only a named token: `color: 'red'` has to
  // displace an ancestor's token color, or a reader below sees the ancestor's.
  //
  // A value that already reads the color it inherits is skipped, because
  // publishing it would resolve it a second time at the descendant — a
  // `color-mix()` over `currentcolor` would fade twice — and `var(--current-color)`
  // into itself is a self-reference that silently drops the declaration.
  if (!RE_READS_CURRENT.test(color)) {
    styles['--current-color'] = color;
  }

  return styles;
}

colorStyle.__lookupStyles = ['color'];
