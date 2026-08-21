import { CSS_WIDE_KEYWORDS } from '../parser/const';
import type { StyleDetails } from '../parser/types';
import { parseStyle } from '../utils/styles';

function toBoxShadow(group: StyleDetails): string {
  const { values, mods, colors } = group;
  const mod = mods[0] || '';
  const shadowColor = colors[0] ?? '';

  return [mod, ...values, shadowColor].join(' ');
}

export function shadowStyle({ shadow }: { shadow?: string | boolean }) {
  if (!shadow) return null;

  if (shadow === true) shadow = 'var(--shadow)';

  if (CSS_WIDE_KEYWORDS.has(shadow)) {
    return { 'box-shadow': shadow };
  }

  // Shadow layers are split by the parser, not by a plain `split(',')` — a
  // color function brings commas of its own, so `color-mix(in oklab, …)` would
  // otherwise be torn into pieces that are neither a layer nor a color.
  const { groups } = parseStyle(shadow);

  return {
    'box-shadow': groups.map(toBoxShadow).join(','),
  };
}

shadowStyle.__lookupStyles = ['shadow'];
