/**
 * Color handling that survives into the emitted CSS.
 *
 * Tasty does not rewrite a color into a particular color space: opacity is
 * applied with CSS relative color syntax, which reads the channels off whatever
 * the browser resolves a value to, so a color is emitted exactly as authored.
 * What is left here is how an alpha gets applied, and the one distinction that
 * matters — replacing a token's alpha versus composing onto an inherited one.
 */

/**
 * The color space a `#name` token's value used to be rewritten into.
 *
 * @deprecated Kept for the `colorSpace` config option, which no longer has any
 * effect. Colors are emitted as authored and opacity is always applied in
 * `oklch` through relative color syntax.
 */
export type ColorSpace = 'rgb' | 'hsl' | 'oklch';

/**
 * Set the alpha of a whole color, replacing any it already carries.
 *
 * CSS relative color syntax is how opacity is applied to every color Tasty
 * emits. `oklch(from <color> l c h / <alpha>)` copies the channels over and
 * writes the alpha slot, which needs nothing from the color except that it *is*
 * a color: a `color-mix()`, a `light-dark()`, a `currentcolor`, a
 * `--name-color` written by hand-authored CSS that Tasty never defined — all of
 * them work, where writing into a channel slot directly would require channels
 * the engine has no way to compute.
 *
 * Alpha is *replaced*, not composed. A token holding `rgb(255 0 0 / .8)` faded
 * to `.5` is alpha `.5`. `color-mix()` against `transparent` cannot do this —
 * it would multiply the two to `.4`.
 *
 * The alpha slot takes a `<number>` or a `<percentage>`, so an opacity custom
 * property passes straight through in whichever form the author declared it.
 *
 * The space is always `oklch`, regardless of the configured {@link ColorSpace}:
 * it is unbounded, so a wide-gamut color survives the round trip that a
 * gamut-limited space would clamp, and it is the space the computed value used
 * to be reported in. Channels are copied rather than interpolated, so the polar
 * form costs nothing even for an achromatic color, whose hue is carried through
 * untouched.
 */
export function overrideColorAlpha(color: string, alpha: string): string {
  return `oklch(from ${color} l c h / ${alpha})`;
}

/**
 * Compose an alpha onto a color, multiplying with any it already carries.
 *
 * This is the counterpart to {@link overrideColorAlpha}, and the difference is
 * the point. A design token names a color, so fading it *sets* its alpha. But
 * `currentcolor` is the color an element **inherits**, which an ancestor may
 * already have faded — `#current.4` there means "40% of what reaches me", and a
 * nested `#current.18` under it composes to `.072`. Design systems build ramps
 * out of exactly that, so `#current` composes and a token replaces.
 *
 * `color-mix()` against `transparent` is what composes: mixing premultiplied
 * leaves the channels alone and multiplies the alphas. Its percentage slot takes
 * no `<number>`, so a `$prop` alpha has to be scaled — which is why an opacity
 * property used as `#current.$prop` has to hold a unitless number, where a token
 * accepts either form.
 */
export function mixColorAlpha(color: string, percentage: string): string {
  return `color-mix(in oklab, ${color} ${percentage}, transparent)`;
}

/**
 * Matches what {@link overrideColorAlpha} builds. The first group is greedy so a
 * nested override splits on its outermost layer.
 */
const RE_ALPHA_OVERRIDE = /^oklch\(from (.+) l c h \/ (.+)\)$/;

/**
 * Split what {@link overrideColorAlpha} builds back into the color it faded and
 * the alpha, or `null` when the value is not one of those.
 */
export function parseAlphaOverride(
  value: string,
): { color: string; alpha: string } | null {
  const match = value.match(RE_ALPHA_OVERRIDE);

  return match ? { color: match[1], alpha: match[2] } : null;
}
