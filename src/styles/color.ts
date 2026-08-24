import { parseColor, resolveCustomProperties } from '../utils/styles';

export function colorStyle({ color }: { color?: string | boolean }) {
  if (!color) return null;

  if (color === true) color = 'currentColor';

  // Resolve whatever the parser recognizes as a color — a `#token`, a fallback
  // chain, a color function with tokens inside it. Anything else (a keyword, a
  // bare `$name`) is emitted verbatim, so references still need substituting or
  // the raw DSL leaks into the declaration.
  color = parseColor(color, true).color || resolveCustomProperties(color);

  const styles: Record<string, string> = { color };

  // A named color is republished as `--current-color` so descendants can pick
  // the inherited color up as a token. `#current` itself would only alias
  // itself, so it is left alone.
  const name = color.match(/var\(--(.+?)-color/)?.[1];

  if (name && name !== 'current') {
    styles['--current-color'] = color;
  }

  return styles;
}

colorStyle.__lookupStyles = ['color'];
