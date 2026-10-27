/**
 * Color handling that survives into the emitted CSS.
 *
 * Tasty does not rewrite a color into a particular color space: opacity is
 * applied with `color-mix()`, which the browser resolves against whatever a
 * value turns out to be, so a color is emitted exactly as authored. What is left
 * here is how an alpha gets applied.
 */

/**
 * The color space a `#name` token's value used to be rewritten into.
 *
 * @deprecated Kept for the `colorSpace` config option, which no longer has any
 * effect. Colors are emitted as authored and opacity is always applied in
 * `oklab` through `color-mix()`.
 */
export type ColorSpace = 'rgb' | 'hsl' | 'oklch';

/**
 * Fade a whole color: `color-mix(in oklab, <color> <percentage>, transparent)`.
 *
 * This is how opacity is applied to every color Tasty emits — a `#token.N`, a
 * `#current.N`, a faded replace token. Mixing against `transparent` needs
 * nothing from the color except that it *is* one: a `color-mix()`, a
 * `light-dark()`, a `currentcolor`, a `--name-color` written by hand-authored
 * CSS that Tasty never defined — all of them work, where writing into a channel
 * slot directly would require channels the engine has no way to compute.
 *
 * `color-mix()` is Baseline widely available (Chrome 111, Firefox 113, Safari
 * 16.2). Relative color syntax, `oklch(from <color> l c h / <alpha>)`, would set
 * the alpha the same way but is not.
 *
 * The mix is premultiplied, so the channels come through untouched and the
 * alphas multiply: a color that is already translucent is faded further. That
 * composes — `#current.4` means "40% of the color that reaches me", and a nested
 * `#current.18` under it lands at `.072` — and a token holding `rgb(255 0 0 /
 * .8)` faded to `.5` is alpha `.4`.
 *
 * The space is `oklab`. It is unbounded, so a wide-gamut color is not clamped,
 * and rectangular, so there is no hue to interpolate against `transparent`.
 *
 * The percentage slot takes no `<number>`, so an opacity custom property used as
 * an alpha (`#name.$prop`) is scaled by `100%` and has to hold a unitless number.
 */
export function mixColorAlpha(color: string, percentage: string): string {
  return `color-mix(in oklab, ${color} ${percentage}, transparent)`;
}

/**
 * Matches what {@link mixColorAlpha} builds, also after the parser has dropped
 * the spaces following its commas. The first group is greedy so a nested fade
 * splits on its outermost layer.
 */
const RE_ALPHA_MIX =
  /^color-mix\(in oklab,\s*(.+) (\S+%|calc\(.+ \* 100%\)),\s*transparent\)$/;

/**
 * Split what {@link mixColorAlpha} builds back into the color it faded and the
 * percentage, or `null` when the value is not one of those.
 */
export function parseAlphaMix(
  value: string,
): { color: string; percentage: string } | null {
  const match = value.match(RE_ALPHA_MIX);

  return match ? { color: match[1], percentage: match[2] } : null;
}

/** A zero alpha: `0`, `0.0`, `.0`, `0%`, or `none`. */
const ZERO_ALPHA = String.raw`(?:0+(?:\.0*)?|\.0+)%?|none`;
/** A color function whose alpha, after a slash, is zero: `rgb(0 0 0 / 0)`. */
const RE_SLASH_ZERO_ALPHA = new RegExp(
  String.raw`\/\s*(?:${ZERO_ALPHA})\s*\)$`,
  'i',
);
/** A legacy `rgba()`/`hsla()` whose fourth argument is zero: `rgba(0,0,0,0)`. */
const RE_LEGACY_ZERO_ALPHA = new RegExp(
  String.raw`^(?:rgba|hsla)\([^(),]*,[^(),]*,[^(),]*,\s*(?:${ZERO_ALPHA})\s*\)$`,
  'i',
);

/**
 * Whether a processed color is fully transparent where the parser can see it:
 * the keyword, a fade to `0%`, or a color function with a zero alpha. A token
 * whose value turns transparent at runtime is not.
 */
export function isTransparent(color: string): boolean {
  return (
    color === 'transparent' ||
    parseAlphaMix(color)?.percentage === '0%' ||
    RE_SLASH_ZERO_ALPHA.test(color) ||
    RE_LEGACY_ZERO_ALPHA.test(color)
  );
}

/**
 * Convert an alpha to the percentage {@link mixColorAlpha} takes, without the
 * float artifact of a bare multiplication (`.07 * 100` is `7.000000000000001`).
 *
 * The alpha is clamped to `[0, 1]`: a mix percentage outside `0%`–`100%` is a
 * parse error that drops the declaration, where an alpha slot would clamp it. A
 * `NaN` is treated as fully opaque.
 */
export function alphaToPercentage(alpha: number): string {
  const clamped = Number.isNaN(alpha) ? 1 : Math.min(1, Math.max(0, alpha));

  return `${Number((clamped * 100).toFixed(6))}%`;
}
