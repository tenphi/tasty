import { makeEmptyDetails } from '../parser/types';
import { parseStyle } from '../utils/styles';

interface ScrollbarStyleProps {
  scrollbar?: string | boolean;
  overflow?: string;
}

/**
 * Standard CSS scrollbar styling via `scrollbar-width`, `scrollbar-color`,
 * and `scrollbar-gutter`.
 *
 * Width values: `thin` (default), `auto`, `none`
 * Modifiers: `stable`, `both-edges`, `always`
 *
 * Note: `auto` is classified as a VALUE_KEYWORD by the parser, so it lands
 * in `values` rather than `mods`. Both locations are checked for robustness.
 */
export function scrollbarStyle({
  scrollbar,
  overflow,
}: ScrollbarStyleProps): Record<string, string> | undefined {
  if (!scrollbar) return;

  // `true` is treated as `thin` (empty string is falsy, caught by the guard above)
  const value = scrollbar === true ? 'thin' : scrollbar;
  const processed = parseStyle(String(value));
  const { mods, colors, values } = processed.groups[0] ?? makeEmptyDetails();

  const defaultThumbColor = 'var(--scrollbar-thumb-color)';
  const defaultTrackColor = 'var(--scrollbar-track-color, transparent)';

  const style: Record<string, string> = {};

  if (mods.includes('none')) {
    style['scrollbar-width'] = 'none';

    return style;
  }

  // `thin` is the default — accepted as a value for readability but always
  // the fallback when neither `auto` nor `none` is specified.
  // `auto` is a VALUE_KEYWORD in the parser, so it may land in `values`.
  if (mods.includes('auto') || values.includes('auto')) {
    style['scrollbar-width'] = 'auto';
  } else {
    style['scrollbar-width'] = 'thin';
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
    const effectiveOverflow = overflow || 'scroll';
    style['overflow'] = effectiveOverflow;

    // scrollbar-gutter only applies with scroll/auto overflow
    if (
      !style['scrollbar-gutter'] &&
      (effectiveOverflow === 'scroll' || effectiveOverflow === 'auto')
    ) {
      style['scrollbar-gutter'] = 'stable';
    }
  }

  return style;
}

scrollbarStyle.__lookupStyles = ['scrollbar', 'overflow'];
