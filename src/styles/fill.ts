import type { StyleDetails } from '../parser/types';
import { isTransparent, parseAlphaMix } from '../utils/color-space';
import {
  isDroppedValue,
  parseStyle,
  resolveCustomProperties,
} from '../utils/styles';
import { warnOnceDev } from '../utils/warnings';

/** A color token, optionally faded: one operand of a compound color. */
const RE_LAYER_OPERAND = /^#[a-z0-9-]+(?:\.(?:\$[a-z_][a-z0-9-_]*|[0-9]+))?$/i;
/** A color token weighted by a literal percentage: `#dark 4%`. */
const RE_WEIGHTED_TOKEN = /^(#[a-z0-9-]+) +([0-9]+(?:\.[0-9]+)?)%$/i;

/** Whether a mix part can be the base of a compound: a token or a compound. */
function isCompoundBase(part: string): boolean {
  return part.split('+').every((operand) => RE_LAYER_OPERAND.test(operand));
}

/**
 * The opacity suffix for a weight strictly between 0% and 100%, written the
 * way Tasty reads it, as the digits of a decimal fraction: `4` is `04`, `4.5` is
 * `045`, `30` is `3`. Built from the digits, so no float artifact creeps in.
 */
function weightToSuffix(weight: string): string | null {
  const [int, frac = ''] = weight.split('.');
  if (int.replace(/^0+/, '').length > 2) return null;

  const digits = (int.padStart(2, '0').slice(-2) + frac).replace(/0+$/, '');
  return digits || null;
}

/**
 * The fix for a mix part that is translucent and unweighted, or `null` when
 * neither part is. With neither part weighted, each takes half, so such a part
 * is weighed down twice, by its share of the mix and by its own alpha, which
 * also leaves the mix see-through: `#dark.04, #surface` is 52% opaque, not
 * `#dark` at 4% over `#surface`.
 */
function fixTranslucentPart(
  groups: StyleDetails[],
  parts: string[],
): string | null {
  for (const [i, group] of groups.entries()) {
    const color = group.colors[0];
    const fade = color && parseAlphaMix(color);
    if (color !== 'transparent' && !(fade && fade.percentage !== '100%')) {
      continue;
    }

    const [part, other] = [parts[i], parts[1 - i]];
    const fix =
      color === 'transparent'
        ? `A transparent color mixes in nothing: use "${other}" alone.`
        : isCompoundBase(other) && RE_LAYER_OPERAND.test(part)
          ? `To paint it over the other color, layer it: "${other}+${part}".`
          : `To paint it over the other color, layer it: ` +
            `"#surface+#dark.04", not "#dark.04, #surface".`;

    return (
      `"${part}" is translucent and has no percentage, so its alpha weighs ` +
      `it down on top of its share of the mix and the background comes out ` +
      `see-through. ${fix}`
    );
  }

  return null;
}

/**
 * How to write a deprecated comma mix today: as a compound color when one part
 * is a token weighted by a literal percentage and the other a token or a
 * compound, and as `color-mix()` itself otherwise. Either is the same color.
 */
function rewriteFillMix(first: StyleDetails, second: StyleDetails): string {
  const parts = [first.input.trim(), second.input.trim()];

  // Opposite a weighted part, a translucent one is only the base of a layer.
  if (first.all.length === 1 && second.all.length === 1) {
    const fix = fixTranslucentPart([first, second], parts);
    if (fix) return fix;
  }

  for (const [i, part] of parts.entries()) {
    const weighted = part.match(RE_WEIGHTED_TOKEN);
    const base = parts[1 - i];
    if (!weighted || !isCompoundBase(base)) continue;

    // A compound leaves out a transparent layer, while the mix lets it thin
    // out the other color: `#clear 10%, #surface` is 90% opaque.
    if (isTransparent([first, second][i].colors[0] ?? '')) break;

    const suffix = weightToSuffix(weighted[2]);
    if (suffix === null) break;

    const compound = `${base}+${weighted[1]}.${suffix}`;
    return `Layer the colors instead: "${compound}" is the same color.`;
  }

  const mix = `color-mix(in srgb, ${parts.join(', ')})`;
  return `Write the mix as color-mix() instead: "${mix}" is the same color.`;
}

/**
 * Mix the comma-separated colors of a fill into one: `'#dark 4%, #surface'` is
 * `color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))`.
 *
 * Mixed in sRGB, an opaque color at weight `a` shows exactly what drawing it at
 * alpha `a` over the other color would, as one `background-color` that contrast
 * checkers can read. The weight has to come from the percentage: a color that
 * is itself translucent is weighted by its alpha as well.
 *
 * Deprecated: a compound color, `'#surface+#dark.04'`, is the same mix and works
 * in every color slot, and `color-mix()` itself covers the rest.
 */
function mixFillColors(
  property: string,
  value: string,
  groups: StyleDetails[],
): string {
  const [first, second] = groups;
  const extra =
    groups.length > 2
      ? ' A mix takes two colors, so the extra ones are ignored.'
      : '';

  warnOnceDev(
    `fill-mix:${property}:${value}`,
    `${property}="${value}": mixing colors with a comma is deprecated. ` +
      `${rewriteFillMix(first, second)}${extra}`,
  );

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
