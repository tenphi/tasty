import { Lru } from '../parser/lru';
import { resolveFunctionColor } from './function-color';

import {
  getRgbValuesFromRgbaString,
  hexToRgbaValues,
  hslToRgbValues,
  oklchToRgbValues,
  rgbToHsl,
  rgbToOklch,
  strToRgb,
} from './color-math';

export type ColorSpace = 'rgb' | 'hsl' | 'oklch';

let currentColorSpace: ColorSpace = 'oklch';

const colorSpaceCache = new Lru<string, string | null>(500);

function clearColorCaches(): void {
  colorSpaceCache.clear();
}

export function getColorSpace(): ColorSpace {
  return currentColorSpace;
}

export function setColorSpace(space: ColorSpace): void {
  currentColorSpace = space;
  clearColorCaches();
}

export function resetColorSpace(): void {
  currentColorSpace = 'oklch';
  clearColorCaches();
}

// ---------------------------------------------------------------------------
// Convert RGB 0-255 values to the configured color space CSS string
// ---------------------------------------------------------------------------

function formatNum(n: number, precision: number): string {
  return parseFloat(n.toFixed(precision)).toString();
}

function formatAlpha(a: number): string {
  if (a === 0) return '0';
  const s = parseFloat(a.toFixed(4)).toString();
  return s;
}

function rgbValuesToColorString(
  r: number,
  g: number,
  b: number,
  space: ColorSpace,
  alpha?: number,
): string {
  const alphaSuffix =
    alpha != null && alpha < 1 ? ` / ${formatAlpha(alpha)}` : '';

  switch (space) {
    case 'rgb':
      return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${alphaSuffix})`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `hsl(${formatNum(h, 2)} ${formatNum(s * 100, 2)}% ${formatNum(l * 100, 2)}%${alphaSuffix})`;
    }
    case 'oklch': {
      const [L, C, H] = rgbToOklch(r, g, b);
      return `oklch(${formatNum(L, 5)} ${formatNum(C, 5)} ${formatNum(H, 2)}${alphaSuffix})`;
    }
  }
}

// ---------------------------------------------------------------------------
// Resolve any color input to 0-255 RGB values + optional alpha
// ---------------------------------------------------------------------------

type RgbaResult = [number, number, number, number];

const parseColorFuncArgs = (
  str: string,
  prefix: string,
): { parts: string[]; alpha: number } | null => {
  const start = str.indexOf('(', prefix.length - 1);
  const end = str.lastIndexOf(')');
  if (start < 0 || end < 0) return null;
  const inner = str.slice(start + 1, end).trim();
  const slashIdx = inner.indexOf('/');

  let colorPart: string;
  let alpha = 1;

  if (slashIdx >= 0) {
    colorPart = inner.slice(0, slashIdx);
    const alphaStr = inner.slice(slashIdx + 1).trim();
    if (alphaStr) {
      alpha = alphaStr.endsWith('%')
        ? parseFloat(alphaStr) / 100
        : parseFloat(alphaStr);
      if (Number.isNaN(alpha)) alpha = 1;
    }
  } else {
    colorPart = inner;
  }

  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  // Legacy comma-separated rgba(r, g, b, a) — 4th value is alpha
  if (parts.length >= 4 && slashIdx < 0) {
    const legacyAlpha = parseFloat(parts[3]);
    if (!Number.isNaN(legacyAlpha)) {
      alpha = legacyAlpha;
    }
  }

  return { parts, alpha };
};

const parseHue = (hueStr: string): number => {
  let h = parseFloat(hueStr);
  const lower = hueStr.toLowerCase();
  if (lower.endsWith('turn')) h = parseFloat(lower) * 360;
  else if (lower.endsWith('rad')) h = (parseFloat(lower) * 180) / Math.PI;
  return ((h % 360) + 360) % 360;
};

const parsePercent = (val: string): number => {
  const num = parseFloat(val);
  return val.includes('%') ? num / 100 : num;
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function resolveToRgbaValues(color: string): RgbaResult | null {
  const trimmed = color.trim().toLowerCase();

  if (trimmed.startsWith('rgb')) {
    const parsed = parseColorFuncArgs(trimmed, 'rgb');
    if (!parsed || parsed.parts.length < 3) return null;
    const r = parsed.parts[0].endsWith('%')
      ? (parseFloat(parsed.parts[0]) / 100) * 255
      : parseFloat(parsed.parts[0]);
    const g = parsed.parts[1].endsWith('%')
      ? (parseFloat(parsed.parts[1]) / 100) * 255
      : parseFloat(parsed.parts[1]);
    const b = parsed.parts[2].endsWith('%')
      ? (parseFloat(parsed.parts[2]) / 100) * 255
      : parseFloat(parsed.parts[2]);
    return [r, g, b, parsed.alpha];
  }

  if (trimmed.startsWith('#')) {
    return hexToRgbaValues(trimmed);
  }

  if (trimmed.startsWith('hsl')) {
    const parsed = parseColorFuncArgs(trimmed, 'hsl');
    if (!parsed) return null;
    const h = parseHue(parsed.parts[0]);
    const s = clamp01(parsePercent(parsed.parts[1]));
    const l = clamp01(parsePercent(parsed.parts[2]));
    const [r, g, b] = hslToRgbValues(h, s, l);
    return [r, g, b, parsed.alpha];
  }

  if (trimmed.startsWith('oklch(')) {
    const parsed = parseColorFuncArgs(trimmed, 'oklch');
    if (!parsed) return null;
    const L = clamp01(parsePercent(parsed.parts[0]));
    const C = Math.max(0, parseFloat(parsed.parts[1]));
    const H = parseHue(parsed.parts[2]);
    const [r, g, b] = oklchToRgbValues(L, C, H);
    return [r, g, b, parsed.alpha];
  }

  // Custom color functions (e.g. okhsl/okhst via plugins) and any other
  // registered parse function whose output is a color: delegate to the parser
  // and recurse on the resulting rgb()/hsl()/oklch() string.
  const resolved = resolveFunctionColor(trimmed);
  if (resolved && resolved !== trimmed) {
    return resolveToRgbaValues(resolved);
  }

  // Fallback: named colors and other formats go through string conversion
  const fallback = strToRgb(trimmed);
  if (fallback) {
    // Recurse so the rgb(...) string is parsed with alpha extraction
    if (fallback !== trimmed) return resolveToRgbaValues(fallback);
    const vals = getRgbValuesFromRgbaString(fallback);
    if (vals.length >= 3) return [vals[0], vals[1], vals[2], 1];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Same-space fast path
// ---------------------------------------------------------------------------

/**
 * Normalize a native CSS color function, but ONLY when its name matches the
 * configured output space — `rgb()`/`rgba()` for `rgb`, and likewise for `hsl`
 * and `oklch`. Such a value is already in the target representation and must
 * NOT be round-tripped through sRGB: that would (a) do needless work for static
 * values, (b) `parseFloat` non-numeric tokens like `var()` / `calc()` to NaN and
 * destroy them, and (c) clamp wide-gamut `oklch()` colors to the sRGB gamut.
 *
 * Arguments are split at the top level and every token — numbers, percentages,
 * `var()`, `calc()`, `min()`, … — survives verbatim. Only the shape is
 * canonicalized: the legacy `a` suffix is dropped from the function name and
 * comma separators become the modern space-and-slash form.
 *
 * Returns null when the input is not a same-space function, leaving the caller
 * to fall back to the sRGB round-trip for genuine cross-space conversion, hex,
 * and named colors.
 */
function normalizeSameSpaceFunc(
  color: string,
  space: ColorSpace,
): string | null {
  // Match the function name case-insensitively, but tokenize the ORIGINAL
  // string: CSS custom-property names are case-sensitive, so lowercasing the
  // whole value would corrupt tokens like `var(--myHue)`.
  const original = color.trim();
  const lower = original.toLowerCase();

  // Every space is named after its own function, optionally carrying the legacy
  // `a` suffix — `rgb`/`rgba`, `hsl`/`hsla`, `oklch`/`oklcha`.
  const nameLength = lower.startsWith(`${space}(`)
    ? space.length
    : lower.startsWith(`${space}a(`)
      ? space.length + 1
      : 0;
  if (!nameLength) return null;

  const end = original.lastIndexOf(')');
  if (end < nameLength) return null;
  const inner = original.slice(nameLength + 1, end).trim();
  if (!inner) return null;

  // Split top-level on whitespace and commas, respecting nested parens.
  const rawTokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const c of inner) {
    if (c === '(') {
      depth++;
      buf += c;
    } else if (c === ')') {
      depth--;
      buf += c;
    } else if (
      depth === 0 &&
      (c === ' ' || c === ',' || c === '\t' || c === '\n')
    ) {
      if (buf) {
        rawTokens.push(buf);
        buf = '';
      }
    } else {
      buf += c;
    }
  }
  if (buf) rawTokens.push(buf);

  // Separate slash-alpha: "a / b" leaves the slash as its own token.
  let alpha: string | null = null;
  const parts: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    if (tok === '/') {
      // Alpha is the next token (verbatim).
      alpha = rawTokens[i + 1] ?? null;
      break;
    }
    parts.push(tok);
  }

  // Legacy comma-separated 4th argument is the alpha (rgba(r,g,b,a)).
  // After splitting, commas are gone; if there are 4 leading parts and no
  // slash alpha was found, treat the 4th as alpha.
  if (alpha === null && parts.length === 4) {
    alpha = parts[3];
    parts.length = 3;
  }

  if (parts.length !== 3) return null;
  // Reject empty tokens (e.g. "rgb(  )").
  if (parts.some((p) => !p)) return null;

  const body = parts.join(' ');

  return alpha != null ? `${space}(${body} / ${alpha})` : `${space}(${body})`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert any supported color string to the configured color space CSS format.
 * Preserves alpha channel when present in the input.
 * Returns null if the input cannot be parsed.
 */
export function strToColorSpace(color: string): string | null | undefined {
  if (!color) return undefined;

  const cached = colorSpaceCache.get(color);
  if (cached !== undefined) return cached;

  // Same-space fast path: when the input is already a native color function in
  // the configured output space, preserve it verbatim instead of round-tripping
  // through sRGB. This avoids needless work for static values, keeps var()/calc()
  // tokens intact, and preserves wide-gamut oklch colors the round-trip would clamp.
  const sameSpace = normalizeSameSpaceFunc(color, currentColorSpace);
  if (sameSpace) {
    colorSpaceCache.set(color, sameSpace);
    return sameSpace;
  }

  const rgba = resolveToRgbaValues(color);
  if (!rgba) {
    colorSpaceCache.set(color, null);
    return null;
  }

  const result = rgbValuesToColorString(
    rgba[0],
    rgba[1],
    rgba[2],
    currentColorSpace,
    rgba[3],
  );
  colorSpaceCache.set(color, result);
  return result;
}

/**
 * Set the alpha of a whole color, replacing any it already carries.
 *
 * CSS relative color syntax is how opacity is applied to every color Tasty
 * emits. `oklch(from <color> l c h / <alpha>)` copies the channels over and
 * writes the alpha slot, which needs nothing from the color except that it *is*
 * a color: a `color-mix()`, a `light-dark()`, a `currentcolor`, a
 * `--name-color` written by hand-authored CSS with no companion variable — all
 * of them work, where writing into a channel slot directly requires components
 * the engine may have no way to compute.
 *
 * Alpha is *replaced*, not composed. A token holding `rgb(255 0 0 / .8)` faded
 * to `.5` is alpha `.5`, matching what the channel-components form did and what
 * a statically-known color still does. `color-mix()` against `transparent`
 * cannot do this — it would multiply the two to `.4`.
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
