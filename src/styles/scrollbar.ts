import { makeEmptyDetails } from '../parser/types';
import { parseStyle } from '../utils/styles';

interface ScrollbarStyleProps {
  scrollbar?: string | boolean | number;
  overflow?: string;
}

/**
 * Standard CSS scrollbar styling via `scrollbar-width`, `scrollbar-color`,
 * and `scrollbar-gutter`.
 */
export function scrollbarStyle({
  scrollbar,
  overflow,
}: ScrollbarStyleProps): Record<string, string> | undefined {
  if (!scrollbar && scrollbar !== 0) return;

  const value = scrollbar === true || scrollbar === '' ? 'thin' : scrollbar;
  const processed = parseStyle(String(value));
  const { mods, colors, values } = processed.groups[0] ?? makeEmptyDetails();

  const defaultThumbColor = 'var(--scrollbar-thumb-color)';
  const defaultTrackColor = 'var(--scrollbar-track-color, transparent)';

  const style: Record<string, string> = {};

  if (mods.includes('none')) {
    style['scrollbar-width'] = 'none';

    return style;
  }

  if (mods.includes('thin')) {
    style['scrollbar-width'] = 'thin';
  } else if (mods.includes('auto') || values.includes('auto')) {
    style['scrollbar-width'] = 'auto';
  }

  const thumbColor = colors?.[0] || defaultThumbColor;
  const trackColor = colors?.[1] || defaultTrackColor;
  style['scrollbar-color'] = `${thumbColor} ${trackColor}`;

  if (mods.includes('stable') || mods.includes('both-edges')) {
    style['scrollbar-gutter'] = mods.includes('both-edges')
      ? 'stable both-edges'
      : 'stable';
  }

  if (mods.includes('always')) {
    style['overflow'] = overflow || 'scroll';

    if (!style['scrollbar-gutter']) {
      style['scrollbar-gutter'] = 'stable';
    }
  }

  return style;
}

scrollbarStyle.__lookupStyles = ['scrollbar', 'overflow'];
