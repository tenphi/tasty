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
  zIndex: ['z-index'],
  inset: ['inset', 'top', 'right', 'bottom', 'left'],
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
  return `var(${varName}, var(--transition))`;
}

export function transitionStyle({ transition }: { transition?: string }) {
  if (!transition) return null;

  if (CSS_WIDE_KEYWORDS.has(transition)) {
    return { transition };
  }

  const processed = parseStyle(transition);
  const map: Record<string, string> = {};

  for (const group of processed.groups) {
    const tokens = group.all;
    const name = tokens[0];

    // The name doubles as the property to transition and as the timing token, so
    // a reference cannot stand in for it.
    if (!name || isTokenNameReference('transition', name)) continue;

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

    const styles = MAP[name];
    if (styles) {
      for (const style of styles) map[style] = value;
    } else {
      map[name] = value;
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
