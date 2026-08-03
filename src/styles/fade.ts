import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { DIRECTIONS, filterMods, parseStyle } from '../utils/styles';

import { warnExtraGroupValues } from './shared';

const DIRECTION_MAP: Record<(typeof DIRECTIONS)[number], string> = {
  right: 'to left',
  left: 'to right',
  top: 'to bottom',
  bottom: 'to top',
};

// Default mask colors (standard black with alpha for gradient masks)
const DEFAULT_TRANSPARENT_COLOR = 'rgb(0 0 0 / 0)';
const DEFAULT_OPAQUE_COLOR = 'rgb(0 0 0 / 1)';

interface GroupData {
  input: string;
  values: string[];
  mods: string[];
  colors: string[];
}

/**
 * Process a single group and return gradient strings for its directions.
 */
function processGroup(group: GroupData, isOnlyGroup: boolean): string[] {
  let { values } = group;
  const { input, mods, colors } = group;

  const named = filterMods(mods, DIRECTIONS) as (typeof DIRECTIONS)[number][];
  let directions = named;

  if (!values.length) {
    values = ['calc(2 * var(--gap))'];
  }

  // If this is the only group and no directions specified, apply to all edges
  if (!directions.length) {
    if (isOnlyGroup) {
      directions = ['top', 'right', 'bottom', 'left'];
    } else {
      // For multi-group without explicit direction, skip this group
      return [];
    }
  }

  // Extract colors: first = transparent mask color, second = opaque mask color
  const transparentColor = colors?.[0] || DEFAULT_TRANSPARENT_COLOR;
  const opaqueColor = colors?.[1] || DEFAULT_OPAQUE_COLOR;

  // A group that names edges takes a single width, applied to every edge it
  // names — different widths per edge come from comma groups
  // (`fade: '3x top, 1x bottom'`). A group that names none covers all four
  // edges and keeps plain CSS shorthand order, so `fade: '3x 1x'` fades block
  // edges at 3x and inline edges at 1x, matching `padding`.
  if (named.length > 0 && values.length > 1) {
    warnExtraGroupValues('fade', input, 1);
  }

  return directions.map(
    (direction: (typeof DIRECTIONS)[number], index: number) => {
      const size =
        named.length > 0
          ? values[0]
          : values[index] || values[index % 2] || values[0];

      return `linear-gradient(${DIRECTION_MAP[direction]}, ${transparentColor} 0%, ${opaqueColor} ${size})`;
    },
  );
}

export function fadeStyle({ fade }: { fade?: string }) {
  if (!fade) return null;

  if (CSS_WIDE_KEYWORDS.has(fade)) {
    return { mask: fade, 'mask-composite': fade };
  }

  const processed = parseStyle(fade);
  const groups: GroupData[] = processed.groups ?? [];

  if (!groups.length) return null;

  const isOnlyGroup = groups.length === 1;

  // Process all groups and collect gradients
  const gradients: string[] = [];

  for (const group of groups) {
    const groupGradients = processGroup(
      {
        input: group.input ?? '',
        values: group.values ?? [],
        mods: group.mods ?? [],
        colors: group.colors ?? [],
      },
      isOnlyGroup,
    );
    gradients.push(...groupGradients);
  }

  if (!gradients.length) return null;

  return {
    mask: gradients.join(', '),
    'mask-composite': 'intersect',
  };
}

fadeStyle.__lookupStyles = ['fade'];
