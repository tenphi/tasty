import { parseStyle } from '../utils/styles';

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
function processTextOverflow(
  textOverflow: string | boolean,
  whiteSpace?: string,
): Record<string, string | number> | null {
  if (textOverflow === true || textOverflow === 'initial') {
    return { 'text-overflow': 'initial' };
  }

  const processed = parseStyle(String(textOverflow));
  const group = processed.groups[0];

  if (!group) return null;

  const { parts } = group;
  const modePart = parts[0];
  const clampPart = parts[1];

  const hasEllipsis = modePart?.mods.includes('ellipsis');
  const hasClip = modePart?.mods.includes('clip');

  if (!hasEllipsis && !hasClip) return null;

  let clamp = 1;

  if (clampPart?.values[0]) {
    const parsed = parseInt(clampPart.values[0], 10);

    if (!isNaN(parsed) && parsed > 0) {
      clamp = parsed;
    }
  }

  const result: Record<string, string | number> = {
    overflow: 'hidden',
    'text-overflow': hasEllipsis ? 'ellipsis' : 'clip',
  };

  if (clamp === 1) {
    result['white-space'] = whiteSpace || 'nowrap';
  } else {
    result['display'] = '-webkit-box';
    result['-webkit-box-orient'] = 'vertical';
    result['-webkit-line-clamp'] = clamp;
    result['line-clamp'] = clamp;
    result['white-space'] = whiteSpace || 'initial';
  }

  return result;
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

  if (textOverflow != null && textOverflow !== false) {
    const textResult = processTextOverflow(textOverflow, whiteSpace);

    if (textResult) Object.assign(result, textResult);
  }

  if (overflow && !result['overflow']) {
    result['overflow'] = overflow;
  }
  if (whiteSpace && !result['white-space']) {
    result['white-space'] = whiteSpace;
  }

  if (hide) {
    result['display'] = 'none';
  } else if (!result['display'] && display) {
    result['display'] = display;
  }

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

displayStyle.__lookupStyles = [
  'display',
  'hide',
  'textOverflow',
  'overflow',
  'whiteSpace',
];
