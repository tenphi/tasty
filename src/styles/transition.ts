import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle } from '../utils/styles';
import { isTokenNameReference } from './shared';

const SECOND_FILL_COLOR_PROPERTY = '--tasty-second-fill-color';

const MAP: Record<string, string[]> = {
  fade: ['mask', 'mask-composite'],
  translate: ['transform', 'translate'],
  rotate: ['transform', 'rotate'],
  scale: ['transform', 'scale'],
  fill: ['background-color', 'background-image', SECOND_FILL_COLOR_PROPERTY],
  image: [
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-attachment',
    'background-origin',
    'background-clip',
    SECOND_FILL_COLOR_PROPERTY,
  ],
  background: [
    'background-color',
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-attachment',
    'background-origin',
    'background-clip',
    SECOND_FILL_COLOR_PROPERTY,
  ],
  border: [
    'border',
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
  ],
  filter: ['filter', 'backdrop-filter'],
  radius: ['border-radius'],
  shadow: ['box-shadow'],
  outline: ['outline', 'outline-offset'],
  preset: [
    'font-size',
    'line-height',
    'letter-spacing',
    'font-weight',
    'font-style',
  ],
  text: ['font-weight', 'text-decoration-color'],
  color: ['color'],
  opacity: ['opacity'],
  theme: [
    'color',
    'background-color',
    'background-image',
    'box-shadow',
    'border',
    'border-radius',
    'outline',
    'opacity',
    SECOND_FILL_COLOR_PROPERTY,
  ],
  width: ['max-width', 'min-width', 'width'],
  height: ['max-height', 'min-height', 'height'],
  gap: ['gap', 'margin'],
  inset: ['inset', 'top', 'right', 'bottom', 'left'],
};

/**
 * Names that reach the handler in a form other than the CSS property they
 * stand for. The parser lowercases tokens, so the `zIndex` style name arrives
 * as `zindex`, which is not a CSS property; it means `z-index`, timing token
 * included, exactly as if the CSS name had been written.
 */
const NAME_ALIASES: Record<string, string> = {
  zindex: 'z-index',
};

const DEFAULT_EASING = 'linear';

const EASING_KEYWORDS = new Set(
  'ease ease-in ease-out ease-in-out linear step-start step-end'.split(' '),
);

function isEasing(token: string): boolean {
  return (
    EASING_KEYWORDS.has(token) ||
    token.startsWith('cubic-bezier(') ||
    token.startsWith('steps(') ||
    token.startsWith('linear(')
  );
}

function getTiming(name: string): string {
  const varName = name.startsWith('--')
    ? `${name}-transition`
    : `--${name}-transition`;
  // `$transition` is one of Tasty's default properties, so it always has a
  // value: no fallback of its own is needed.
  return `var(${varName}, var(--transition))`;
}

export function transitionStyle({ transition }: { transition?: string }) {
  if (!transition) return null;

  if (CSS_WIDE_KEYWORDS.has(transition)) {
    return { transition };
  }

  const processed = parseStyle(transition);
  const map: Record<string, string> = {};
  // Properties set by an entry that names exactly one property. A group such
  // as `theme` that also covers one of them leaves it alone, whatever the
  // order: in `opacity 120ms ease-in-out, theme`, the opacity entry is the
  // author's intent, not something `theme` should silently overwrite. Entries
  // of the same kind still resolve last-wins, as CSS does.
  const named = new Set<string>();

  for (const group of processed.groups) {
    const tokens = group.all;
    let name = tokens[0];

    // The name doubles as the property to transition and as the timing token, so
    // a reference cannot stand in for it.
    if (!name || isTokenNameReference('transition', name)) continue;

    name = NAME_ALIASES[name] ?? name;

    let timing: string | undefined;
    let easing: string | undefined;
    let delay: string | undefined;

    if (tokens[1] && isEasing(tokens[1])) {
      easing = tokens[1];
      delay = tokens[2];
    } else {
      timing = tokens[1];
      easing = tokens[2];
      delay = tokens[3];
    }

    let value = timing || getTiming(name);
    if (easing || delay) {
      value += ` ${easing || DEFAULT_EASING}`;
    }
    if (delay) {
      value += ` ${delay}`;
    }

    const styles = MAP[name] ?? [name];
    const isGroup = styles.length > 1;

    for (const style of styles) {
      if (isGroup && named.has(style)) continue;
      map[style] = value;
      if (!isGroup) named.add(style);
    }
  }

  // Every entry may have been rejected as a reference-named transition.
  const result = Object.keys(map)
    .map((style) => `${style} ${map[style]}`)
    .join(', ');
  if (!result) return null;

  return { transition: result };
}

transitionStyle.__lookupStyles = ['transition'];
