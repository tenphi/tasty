export const VALUE_KEYWORDS = new Set([
  'auto',
  'max-content',
  'min-content',
  'fit-content',
  'stretch',
  'initial',
  'inherit',
  'revert',
  'unset',
  'revert-layer',
]);

export const CSS_WIDE_KEYWORDS = new Set([
  'initial',
  'inherit',
  'revert',
  'unset',
  'revert-layer',
]);

/**
 * Color functions that *derive* a color from other colors. They take no alpha
 * channel, so opacity has to wrap the whole call in `color-mix()` instead of
 * being appended after a slash.
 */
const DERIVED_COLOR_FUNCS_LIST = [
  'color-mix',
  'color-contrast',
  'contrast-color',
  'light-dark',
];

export const DERIVED_COLOR_FUNCS = new Set(DERIVED_COLOR_FUNCS_LIST);

/**
 * Every color function the parser recognizes. The ones outside
 * `DERIVED_COLOR_FUNCS` take channels as arguments, optionally followed by
 * `/ <alpha>` — which is where an opacity suffix writes.
 */
export const COLOR_FUNCS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'device-cmyk',
  'gray',
  ...DERIVED_COLOR_FUNCS_LIST,
]);

/**
 * The one color function CSS also allows to carry non-color values, so its
 * bucket depends on the arguments: `light-dark(#dark, #light)` is a color, while
 * `light-dark(1x, 2x)` is a plain value and has to stay out of the color slot.
 */
export const POLYMORPHIC_COLOR_FUNC = 'light-dark';

/** A value that is a single `name(args)` call: captures the name and the args. */
export const RE_FUNC_CALL = /^([a-z][a-z0-9-]*)\((.+)\)$/i;

export const RE_UNIT_NUM = /^[+-]?(?:\d*\.\d+|\d+)([a-z][a-z0-9]*)$/;
export const RE_NUMBER = /^[+-]?(?:\d*\.\d+|\d+)$/;
export const RE_HEX = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}(?:[0-9a-f]{2})?)$/;
// Matches raw CSS unit values like "8px", "1rem", "0.5em" - captures number and unit separately
export const RE_RAW_UNIT = /^([+-]?(?:\d*\.\d+|\d+))([a-z%]+)$/;

const CANONICAL_FUNC_CASE = new Map([
  ['translatex', 'translateX'],
  ['translatey', 'translateY'],
  ['translatez', 'translateZ'],
  ['scalex', 'scaleX'],
  ['scaley', 'scaleY'],
  ['scalez', 'scaleZ'],
  ['rotatex', 'rotateX'],
  ['rotatey', 'rotateY'],
  ['rotatez', 'rotateZ'],
  ['skewx', 'skewX'],
  ['skewy', 'skewY'],
]);

export function canonicalFuncName(lowered: string): string {
  return CANONICAL_FUNC_CASE.get(lowered) ?? lowered;
}
