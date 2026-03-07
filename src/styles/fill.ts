import { parseStyle } from '../utils/styles';

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
  fill?: string;
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

  // Priority: backgroundColor > fill
  const colorValue = backgroundColor ?? fill;
  if (colorValue) {
    const parsed = parseStyle(colorValue);
    const firstColor = parsed.groups[0]?.colors[0];
    const secondColor = parsed.groups[0]?.colors[1];

    result['background-color'] = firstColor || colorValue;

    if (secondColor) {
      result['--tasty-second-fill-color'] = secondColor;
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
    result['background-repeat'] = backgroundRepeat;
  }
  if (backgroundAttachment) {
    result['background-attachment'] = backgroundAttachment;
  }
  if (backgroundOrigin) {
    result['background-origin'] = backgroundOrigin;
  }
  if (backgroundClip) {
    result['background-clip'] = backgroundClip;
  }

  if (Object.keys(result).length === 0) return;
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
  if (!svgFill) return;

  const processed = parseStyle(svgFill);
  svgFill = processed.groups[0]?.colors[0] || svgFill;

  return { fill: svgFill };
}

svgFillStyle.__lookupStyles = ['svgFill'];
