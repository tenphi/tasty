import { makeEmptyDetails } from '../parser/types';
import type { CSSMap } from '../utils/styles';
import { parseStyle } from '../utils/styles';
import { warn } from '../utils/warnings';

interface ScrollbarStyleProps {
  scrollbar?: string | boolean | number;
  overflow?: string;
}

/**
 * Standards-first scrollbar styling.
 *
 * Uses `scrollbar-width`, `scrollbar-color`, and `scrollbar-gutter` as the
 * primary approach. Adds `::-webkit-scrollbar-*` pseudo-elements only when
 * the `styled` modifier or a custom size value is specified — for features
 * the standard API cannot express (border-radius, transitions, explicit
 * dimensions).
 *
 * Returns CSSMap[] where pseudo-element rules use $ for sub-selectors.
 */
export function scrollbarStyle({
  scrollbar,
  overflow,
}: ScrollbarStyleProps): CSSMap[] | undefined {
  if (!scrollbar && scrollbar !== 0) return;

  const value = scrollbar === true || scrollbar === '' ? 'thin' : scrollbar;
  const processed = parseStyle(String(value));
  const { mods, colors, values } = processed.groups[0] ?? makeEmptyDetails();

  const defaultThumbColor = 'var(--scrollbar-thumb-color)';
  const defaultTrackColor = 'var(--scrollbar-track-color, transparent)';

  if (mods.includes('none')) {
    return [
      { 'scrollbar-width': 'none' },
      {
        $: '::-webkit-scrollbar',
        width: '0px',
        height: '0px',
        display: 'none',
      },
    ];
  }

  const root: Record<string, string> = {};

  const sizeValues = values.filter((v) => v !== 'auto');
  const hasCustomSize = sizeValues.length > 0;
  const isStyled = mods.includes('styled');
  const needsWebkit = isStyled || hasCustomSize;

  if (needsWebkit && mods.includes('thin')) {
    warn(
      'scrollbar: "thin" has no effect when "styled" or a custom size is used — webkit pseudo-elements require scrollbar-width: auto.',
    );
  }

  // webkit pseudo-elements only work when scrollbar-width is auto.
  // When we emit webkit rules, force auto so they actually take effect.
  if (needsWebkit) {
    root['scrollbar-width'] = 'auto';
  } else if (mods.includes('thin')) {
    root['scrollbar-width'] = 'thin';
  } else if (values.includes('auto')) {
    root['scrollbar-width'] = 'auto';
  }

  const thumbColor = colors?.[0] || defaultThumbColor;
  const trackColor = colors?.[1] || defaultTrackColor;
  root['scrollbar-color'] = `${thumbColor} ${trackColor}`;

  if (mods.includes('stable') || mods.includes('both-edges')) {
    root['scrollbar-gutter'] = mods.includes('both-edges')
      ? 'stable both-edges'
      : 'stable';
  }

  if (mods.includes('always')) {
    root['overflow'] = overflow || 'auto';

    if (!root['scrollbar-gutter']) {
      root['scrollbar-gutter'] = 'stable';
    }
  }

  const result: CSSMap[] = [root];

  if (needsWebkit) {
    const defaultSize = '8px';
    const sizeValue = sizeValues[0] || defaultSize;
    const cornerColor = colors?.[2] || trackColor;

    const webkitScrollbar: Record<string, string> = {
      width: sizeValue,
      height: sizeValue,
    };

    const webkitTrack: Record<string, string> = {};
    const webkitThumb: Record<string, string> = {};
    const webkitCorner: Record<string, string> = {};

    if (colors?.length) {
      webkitScrollbar['background'] = trackColor;
      webkitTrack['background'] = trackColor;
      webkitThumb['background'] = thumbColor;
      webkitCorner['background'] = cornerColor;
    }

    if (isStyled) {
      const baseTransition = [
        'background var(--transition)',
        'border-radius var(--transition)',
        'box-shadow var(--transition)',
        'width var(--transition)',
        'height var(--transition)',
        'border var(--transition)',
      ].join(', ');

      webkitScrollbar['transition'] = baseTransition;
      if (!webkitScrollbar['background']) {
        webkitScrollbar['background'] = defaultTrackColor;
      }

      if (!webkitThumb['background']) {
        webkitThumb['background'] = defaultThumbColor;
      }
      webkitThumb['border-radius'] = '8px';
      webkitThumb['min-height'] = '24px';
      webkitThumb['transition'] = baseTransition;

      if (!webkitTrack['background']) {
        webkitTrack['background'] = defaultTrackColor;
      }
      webkitTrack['transition'] = baseTransition;

      if (!webkitCorner['background']) {
        webkitCorner['background'] = defaultTrackColor;
      }
      webkitCorner['transition'] = baseTransition;
    }

    result.push({ $: '::-webkit-scrollbar', ...webkitScrollbar });

    if (Object.keys(webkitTrack).length) {
      result.push({ $: '::-webkit-scrollbar-track', ...webkitTrack });
    }

    if (Object.keys(webkitThumb).length) {
      result.push({ $: '::-webkit-scrollbar-thumb', ...webkitThumb });
    }

    if (Object.keys(webkitCorner).length) {
      result.push({ $: '::-webkit-scrollbar-corner', ...webkitCorner });
    }
  }

  return result;
}

scrollbarStyle.__lookupStyles = ['scrollbar', 'overflow'];
