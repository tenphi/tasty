import { parseStyle, resolveCustomProperties } from '../utils/styles';

interface DisplayStyleProps {
  display?: string;
  hide?: boolean;
  textOverflow?: string | boolean;
  overflow?: string;
  whiteSpace?: string;
}

/**
 * Process textOverflow into CSS properties for truncation/clamping.
 *
 * - `ellipsis` — single-line truncation with ellipsis
 * - `ellipsis / 3` — multi-line clamping (3 lines) with ellipsis
 * - `clip` — single-line truncation with clip
 * - `clip / 2` — multi-line clip (2 lines)
 * - `true` or `initial` — reset to initial
 */
function applyTextOverflow(
  result: Record<string, string | number>,
  textOverflow: string | boolean,
  whiteSpace?: string,
): void {
  if (textOverflow === true || textOverflow === 'initial') {
    result['text-overflow'] = 'initial';

    return;
  }

  const processed = parseStyle(String(textOverflow));
  const group = processed.groups[0];

  if (!group) return;

  const { parts } = group;
  const modePart = parts[0];
  const clampPart = parts[1];

  const hasEllipsis = modePart?.mods.includes('ellipsis');
  const hasClip = modePart?.mods.includes('clip');

  if (!hasEllipsis && !hasClip) return;

  let clamp = 1;

  if (clampPart?.values[0]) {
    const parsed = parseInt(clampPart.values[0], 10);

    if (!isNaN(parsed) && parsed > 0) {
      clamp = parsed;
    }
  }

  result['overflow'] = 'hidden';
  result['text-overflow'] = hasEllipsis ? 'ellipsis' : 'clip';

  if (clamp === 1) {
    result['white-space'] = whiteSpace || 'nowrap';
  } else {
    result['display'] = '-webkit-box';
    result['-webkit-box-orient'] = 'vertical';
    result['-webkit-line-clamp'] = clamp;
    result['line-clamp'] = clamp;
    result['white-space'] = whiteSpace || 'initial';
  }
}

/**
 * Handles display, hide, textOverflow, overflow, and whiteSpace styles.
 *
 * Priority:
 * 1. `hide` takes precedence (display: none)
 * 2. Multi-line `textOverflow` forces display: -webkit-box
 * 3. Single-line `textOverflow` defaults white-space to nowrap
 * 4. Explicit `whiteSpace` overrides the default from `textOverflow`
 */
export function displayStyle({
  display,
  hide,
  textOverflow,
  overflow,
  whiteSpace,
}: DisplayStyleProps) {
  const result: Record<string, string | number> = {};

  // Resolved once up front: `applyTextOverflow` emits `whiteSpace` as the
  // clamp's `white-space` too, so substituting only at the branch below would
  // still leak the raw reference through the truncation path.
  const whiteSpaceValue = whiteSpace
    ? resolveCustomProperties(whiteSpace)
    : whiteSpace;

  if (textOverflow != null && textOverflow !== false) {
    applyTextOverflow(result, textOverflow, whiteSpaceValue);
  }

  if (overflow && !result['overflow']) {
    result['overflow'] = resolveCustomProperties(overflow);
  }
  if (whiteSpaceValue && !result['white-space']) {
    result['white-space'] = whiteSpaceValue;
  }

  if (hide) {
    result['display'] = 'none';
  } else if (!result['display'] && display) {
    result['display'] = resolveCustomProperties(display);
  }

  return result['text-overflow'] ||
    result['overflow'] ||
    result['white-space'] ||
    result['display']
    ? result
    : null;
}

displayStyle.__lookupStyles = [
  'display',
  'hide',
  'textOverflow',
  'overflow',
  'whiteSpace',
];
