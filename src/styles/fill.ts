import type { StyleDetails } from '../parser/types';
import { parseAlphaMix } from '../utils/color-space';
import { parseStyle, resolveCustomProperties } from '../utils/styles';
import { warnOnceDev } from '../utils/warnings';

/**
 * Mix the comma-separated colors of a fill into one: `'#dark 4%, #surface'` is
 * `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`.
 *
 * Mixed in sRGB, an opaque color at weight `a` shows exactly what drawing it at
 * alpha `a` over the other color would, as one `background-color` that contrast
 * checkers can read. The weight has to come from the percentage: a color that
 * is itself translucent is weighted by its alpha as well.
 */
function mixFillColors(
  property: string,
  value: string,
  groups: StyleDetails[],
): string {
  if (groups.length > 2) {
    warnOnceDev(
      `fill-mix-extra:${property}:${value}`,
      `${property}="${value}": a mix takes two colors. The extra ones are ` +
        `ignored.`,
    );
  }

  const [first, second] = groups;

  for (const group of [first, second]) {
    // A translucent color without a weight is weighed down twice, by its share
    // of the mix and by its own alpha, which also leaves the mix see-through:
    // `#dark.04, #surface` is 52% opaque, not `#dark` at 4% over `#surface`.
    if (group.all.length !== 1) continue;

    const color = group.colors[0];
    const fade = color && parseAlphaMix(color);

    if (color === 'transparent' || (fade && fade.percentage !== '100%')) {
      warnOnceDev(
        `fill-mix-alpha:${property}:${value}`,
        `${property}="${value}": "${group.input}" is translucent and has no ` +
          `percentage, so its alpha weighs it down on top of its share of the ` +
          `mix and the background comes out see-through. Give the color a ` +
          `weight instead: "#dark 4%, #surface", not "#dark.04, #surface". ` +
          `A transparent color mixes in nothing; leave it out.`,
      );
    }
  }

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
      result['background-color'] =
        firstColor || resolveCustomProperties(colorValue);

      if (secondColor) {
        // A token and a faded token join into a compound color that paints the
        // same thing.
        const tokens = colorValue.trim().split(/\s+/);
        const compound =
          tokens.length === 2 &&
          tokens[0][0] === '#' &&
          /^#[^.]+\.\S+$/.test(tokens[1])
            ? tokens.join('+')
            : '#surface+#dark.04';

        warnOnceDev(
          `fill-two-colors:${colorProperty}:${colorValue}`,
          `${colorProperty}="${colorValue}": two colors separated by a space ` +
            `are deprecated. The second one is painted as a background-image ` +
            `layer, which contrast checkers such as axe cannot read. Join them ` +
            `with a plus instead: "${compound}" paints the second color over ` +
            `the first as one background color.`,
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
  svgFill = processed.groups[0]?.colors[0] || resolveCustomProperties(svgFill);

  return { fill: svgFill };
}

svgFillStyle.__lookupStyles = ['svgFill'];
