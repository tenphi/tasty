import type { StyleDetails } from '../parser/types';
import { isTransparent, parseAlphaMix } from '../utils/color-space';
import {
  isDroppedValue,
  parseStyle,
  resolveCustomProperties,
} from '../utils/styles';
import { warnOnceDev } from '../utils/warnings';

/**
 * Mix the comma-separated colors of a fill into one: `'#dark 4%, #surface'` is
 * `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`.
 *
 * Deprecated: a compound color, `'#surface+#dark.04'`, is the same mix and works
 * in every color slot, and `color-mix()` itself covers the rest. The warning
 * names both forms rather than working out each value's rewrite, which would
 * ship in every bundle; the ESLint plugin's `tasty/prefer-fill-mix` does that.
 */
function mixFillColors(
  property: string,
  value: string,
  groups: StyleDetails[],
): string {
  warnOnceDev(
    `fill-mix:${property}:${value}`,
    `${property}="${value}": mixing colors with a comma is deprecated. Layer ` +
      `the colors as a compound color instead: "#dark 4%, #surface" is ` +
      `"#surface+#dark.04". For any other mix, write color-mix() itself, ` +
      `such as "color-mix(in srgb, #dark $weight, #surface)".` +
      (groups.length > 2
        ? ' A mix takes two colors; the rest are ignored.'
        : ''),
  );

  const [first, second] = groups;
  return `color-mix(in srgb, ${first.output}, ${second.output})`;
}

export function fillStyle({
  fill,
  backgroundColor,
  image,
  backgroundImage,
  backgroundPosition,
  backgroundSize,
  backgroundRepeat,
  backgroundAttachment,
  backgroundOrigin,
  backgroundClip,
  background,
}: {
  fill?: string | boolean;
  backgroundColor?: string;
  image?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
  backgroundOrigin?: string;
  backgroundClip?: string;
  background?: string;
}) {
  // If background is set, it overrides everything
  if (background) {
    const processed = parseStyle(background);
    return { background: processed.output || background };
  }

  const result: Record<string, string> = {};

  // `fill: true` names no color, and there is no default fill to stand in for
  // one. Passed through, it became `background-color: true`, which the browser
  // drops, so it is skipped and reported instead.
  if (fill === true) {
    warnOnceDev(
      'fill-true',
      'fill: true has no default color and is ignored. Write a color ' +
        "(fill: '#surface'), or false for no fill.",
    );
  }

  // Priority: backgroundColor > fill
  const colorProperty = backgroundColor != null ? 'backgroundColor' : 'fill';
  const colorValue =
    backgroundColor ?? (typeof fill === 'string' ? fill : undefined);
  if (colorValue) {
    const { groups } = parseStyle(colorValue);

    if (groups.length > 1) {
      result['background-color'] = mixFillColors(
        colorProperty,
        colorValue,
        groups,
      );
    } else {
      const firstColor = groups[0]?.colors[0];
      const secondColor = groups[0]?.colors[1];

      // No color found: the value may still be a custom-property reference the
      // parser classified as a plain value (`$name` is a color only when the
      // name ends with `-color`), so substitute before falling back to the raw
      // input.
      if (firstColor || !isDroppedValue(colorValue)) {
        result['background-color'] =
          firstColor || resolveCustomProperties(colorValue);
      }

      if (secondColor) {
        // The fix depends on what the overlay resolves to: a faded overlay
        // joins its base in a compound color that paints the same thing, a
        // transparent one painted nothing, and an opaque one covered its base.
        const tokens = colorValue.trim().split(/\s+/);
        const [base, overlay] = tokens;
        const join = (compound: string) =>
          `Join them with a plus instead: "${compound}" paints the second ` +
          `color over the first as one background color.`;
        const makeOpaque = `make it opaque and give it an opacity: "${base}+${overlay}.04".`;

        let fix: string;
        if (tokens.length !== 2 || base[0] !== '#' || overlay[0] !== '#') {
          fix = join('#surface+#dark.04');
        } else if (isTransparent(secondColor)) {
          fix =
            `"${overlay}" paints nothing, so use the first color alone: ` +
            `"${base}".`;
        } else if (overlay.includes('.')) {
          fix = join(`${base}+${overlay}`);
        } else if (parseAlphaMix(secondColor) || secondColor.includes('/')) {
          fix =
            `"${overlay}" is translucent, which would leave a compound ` +
            `see-through, so ${makeOpaque}`;
        } else {
          fix =
            `If "${overlay}" is opaque, it covers the first color, so use it ` +
            `alone: "${overlay}". If it is translucent, ${makeOpaque}`;
        }

        warnOnceDev(
          `fill-two-colors:${colorProperty}:${colorValue}`,
          `${colorProperty}="${colorValue}": two colors separated by a space ` +
            `are deprecated. The second one is painted as a background-image ` +
            `layer, which contrast checkers such as axe cannot read. ${fix}`,
        );
        result['--tasty-second-fill-color'] = secondColor;
      }
    }
  }

  const gradientLayer = result['--tasty-second-fill-color']
    ? 'linear-gradient(var(--tasty-second-fill-color), var(--tasty-second-fill-color))'
    : null;

  // Priority: backgroundImage > image
  const imageValue = backgroundImage ?? image;
  if (imageValue) {
    const parsed = parseStyle(imageValue);
    const imgCss = parsed.output || imageValue;

    result['background-image'] = gradientLayer
      ? `${imgCss}, ${gradientLayer}`
      : imgCss;
  } else if (gradientLayer) {
    result['background-image'] = gradientLayer;
  }

  // Other background properties (pass through with parseStyle for token support)
  if (backgroundPosition) {
    result['background-position'] =
      parseStyle(backgroundPosition).output || backgroundPosition;
  }
  if (backgroundSize) {
    result['background-size'] =
      parseStyle(backgroundSize).output || backgroundSize;
  }
  if (backgroundRepeat) {
    result['background-repeat'] = resolveCustomProperties(backgroundRepeat);
  }
  if (backgroundAttachment) {
    result['background-attachment'] =
      resolveCustomProperties(backgroundAttachment);
  }
  if (backgroundOrigin) {
    result['background-origin'] = resolveCustomProperties(backgroundOrigin);
  }
  if (backgroundClip) {
    result['background-clip'] = resolveCustomProperties(backgroundClip);
  }

  if (Object.keys(result).length === 0) return null;
  return result;
}

fillStyle.__lookupStyles = [
  'fill',
  'backgroundColor',
  'image',
  'backgroundImage',
  'backgroundPosition',
  'backgroundSize',
  'backgroundRepeat',
  'backgroundAttachment',
  'backgroundOrigin',
  'backgroundClip',
  'background',
];

export function svgFillStyle({ svgFill }: { svgFill?: string }) {
  if (!svgFill) return null;

  const processed = parseStyle(svgFill);
  if (!processed.groups[0]?.colors[0] && isDroppedValue(svgFill)) return null;
  svgFill = processed.groups[0]?.colors[0] || resolveCustomProperties(svgFill);

  return { fill: svgFill };
}

svgFillStyle.__lookupStyles = ['svgFill'];
