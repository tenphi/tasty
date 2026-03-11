import { parseStyle } from '../utils/styles';

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

export const DEFAULT_TIMING = 'var(--transition)';
const DEFAULT_EASING = 'linear';

const EASING_KEYWORDS = new Set([
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
]);

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

type TransitionEntry = [
  name: string,
  easing: string | undefined,
  timing: string | undefined,
  delay: string | undefined,
];

export function transitionStyle({ transition }: { transition?: string }) {
  if (!transition) return;

  const processed = parseStyle(transition);
  const tokens: string[] = [];
  processed.groups.forEach((g, idx) => {
    tokens.push(...g.all);
    if (idx < processed.groups.length - 1) tokens.push(',');
  });

  if (tokens.length === 0) return;

  let tempTransition: string[] = [];
  const transitions: string[][] = [];

  tokens.forEach((token) => {
    if (token === ',') {
      if (tempTransition.length) {
        transitions.push(tempTransition);
        tempTransition = [];
      }
    } else {
      tempTransition.push(token);
    }
  });

  if (tempTransition.length) {
    transitions.push(tempTransition);
  }

  const map: Record<string, TransitionEntry> = {};

  transitions.forEach((transition) => {
    const name = transition[0];

    let timing: string | undefined;
    let easing: string | undefined;
    let delay: string | undefined;

    if (transition[1] && isEasing(transition[1])) {
      easing = transition[1];
      delay = transition[2];
    } else {
      timing = transition[1];
      easing = transition[2];
      delay = transition[3];
    }

    const styles = MAP[name] || [name];

    styles.forEach((style) => {
      map[style] = [name, easing, timing, delay];
    });
  });

  const result = Object.entries(map)
    .map(([style, [name, easing, timing, delay]]) => {
      let value = `${style} ${timing || getTiming(name)}`;
      if (easing || delay) {
        value += ` ${easing || DEFAULT_EASING}`;
      }
      if (delay) {
        value += ` ${delay}`;
      }
      return value;
    })
    .join(', ');

  return { transition: result };
}

transitionStyle.__lookupStyles = ['transition'];
