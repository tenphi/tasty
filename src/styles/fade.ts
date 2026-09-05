import { CSS_WIDE_KEYWORDS } from '../parser/const';
import type { StyleDetails } from '../parser/types';
import { DIRECTIONS, parseStyle } from '../utils/styles';

import { warnExtraGroupValues } from './shared';

// Positional counterparts to DIRECTIONS: top, right, bottom, left.
const GRADIENT_DIRECTIONS = ['to bottom', 'to left', 'to top', 'to right'];

// Default mask colors (standard black with alpha for gradient masks)
const DEFAULT_TRANSPARENT_COLOR = 'rgb(0 0 0 / 0)';
const DEFAULT_OPAQUE_COLOR = 'rgb(0 0 0 / 1)';

/**
 * Process a single group and append gradient strings for its directions.
 */
function processGroup(
  group: StyleDetails,
  isOnlyGroup: boolean,
  gradients: string[],
): void {
  const { input, values, mods, colors } = group;

  // Extract colors: first = transparent mask color, second = opaque mask color
  const transparentColor = colors[0] || DEFAULT_TRANSPARENT_COLOR;
  const opaqueColor = colors[1] || DEFAULT_OPAQUE_COLOR;
  const firstSize = values.length ? values[0] : 'calc(2 * var(--gap))';
  let namedCount = 0;

  // A group that names edges takes a single width, applied to every edge it
  // names — different widths per edge come from comma groups
  // (`fade: '3x top, 1x bottom'`). A group that names none covers all four
  // edges and keeps plain CSS shorthand order, so `fade: '3x 1x'` fades block
  // edges at 3x and inline edges at 1x, matching `padding`.
  for (const mod of mods) {
    const directionIndex = DIRECTIONS.indexOf(mod);
    if (directionIndex === -1) continue;

    if (namedCount++ === 0 && values.length > 1) {
      warnExtraGroupValues('fade', input, 1);
    }

    gradients.push(
      `linear-gradient(${GRADIENT_DIRECTIONS[directionIndex]}, ${transparentColor} 0%, ${opaqueColor} ${firstSize})`,
    );
  }

  if (namedCount || !isOnlyGroup) return;

  // If this is the only group and no directions are specified, apply it to
  // every edge in CSS shorthand order.
  for (let i = 0; i < DIRECTIONS.length; i++) {
    const size = values.length
      ? values[i] || values[i % 2] || values[0]
      : firstSize;

    gradients.push(
      `linear-gradient(${GRADIENT_DIRECTIONS[i]}, ${transparentColor} 0%, ${opaqueColor} ${size})`,
    );
  }
}

export function fadeStyle({ fade }: { fade?: string }) {
  if (!fade) return null;

  if (CSS_WIDE_KEYWORDS.has(fade)) {
    return { mask: fade, 'mask-composite': fade };
  }

  const groups = parseStyle(fade).groups;

  if (!groups.length) return null;

  const isOnlyGroup = groups.length === 1;

  // Process all groups and collect gradients
  const gradients: string[] = [];

  for (const group of groups) {
    processGroup(group, isOnlyGroup, gradients);
  }

  if (!gradients.length) return null;

  return {
    mask: gradients.join(', '),
    'mask-composite': 'intersect',
  };
}

fadeStyle.__lookupStyles = ['fade'];
