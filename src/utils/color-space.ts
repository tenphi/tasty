import { Lru } from '../parser/lru';

import {
  getRgbValuesFromRgbaString,
  hexToRgbaValues,
  hslToRgbValues,
  okhslToSrgb,
  okhstToSrgb,
  oklchToRgbValues,
  rgbToHsl,
  rgbToOklch,
  strToRgb,
} from './color-math';

export type ColorSpace = 'rgb' | 'hsl' | 'oklch';

let currentColorSpace: ColorSpace = 'oklch';

const colorSpaceCache = new Lru<string, string | null>(500);
const componentsCache = new Lru<string, string>(500);

function clearColorCaches(): void {
  colorSpaceCache.clear();
  componentsCache.clear();
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

export function getColorSpaceSuffix(): string {
  return currentColorSpace;
}

export function getColorSpaceFunc(): string {
  return currentColorSpace;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatNum(n: number, precision: number): string {
  return parseFloat(n.toFixed(precision)).toString();
}

function formatRgbComponent(n: number): string {
  return parseFloat(n.toFixed(1)).toString();
}

// ---------------------------------------------------------------------------
// Convert RGB 0-255 values to the configured color space CSS string
// ---------------------------------------------------------------------------

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
// Extract decomposed components string (no wrapping function)
// ---------------------------------------------------------------------------

function rgbValuesToComponents(
  r: number,
  g: number,
  b: number,
  space: ColorSpace,
): string {
  switch (space) {
    case 'rgb':
      return `${formatRgbComponent(r)} ${formatRgbComponent(g)} ${formatRgbComponent(b)}`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `${formatNum(h, 2)} ${formatNum(s * 100, 2)}% ${formatNum(l * 100, 2)}%`;
    }
    case 'oklch': {
      const [L, C, H] = rgbToOklch(r, g, b);
      return `${formatNum(L, 5)} ${formatNum(C, 5)} ${formatNum(H, 2)}`;
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

  if (trimmed.startsWith('okhsl(')) {
    const parsed = parseColorFuncArgs(trimmed, 'okhsl');
    if (!parsed) return null;
    const h = parseHue(parsed.parts[0]);
    const s = clamp01(parsePercent(parsed.parts[1]));
    const l = clamp01(parsePercent(parsed.parts[2]));
    const [r, g, b] = okhslToSrgb(h, s, l);
    return [clamp01(r) * 255, clamp01(g) * 255, clamp01(b) * 255, parsed.alpha];
  }

  if (trimmed.startsWith('okhst(')) {
    const parsed = parseColorFuncArgs(trimmed, 'okhst');
    if (!parsed) return null;
    const h = parseHue(parsed.parts[0]);
    const s = clamp01(parsePercent(parsed.parts[1]));
    const t = clamp01(parsePercent(parsed.parts[2]));
    const [r, g, b] = okhstToSrgb(h, s, t);
    return [clamp01(r) * 255, clamp01(g) * 255, clamp01(b) * 255, parsed.alpha];
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

// Native CSS color function names that map directly to a ColorSpace.
// When the input function matches the configured output space, the value is
// already in the target representation and must NOT be round-tripped through
// sRGB. Round-tripping would (a) do needless work for static values, (b)
// `parseFloat` non-numeric tokens like `var()` / `calc()` to NaN and destroy
// them, and (c) clamp wide-gamut `oklch()` colors to the sRGB gamut.
const SPACE_FUNCS: Record<ColorSpace, string[]> = {
  rgb: ['rgb', 'rgba'],
  hsl: ['hsl', 'hsla'],
  oklch: ['oklch', 'oklcha'],
};

const CANONICAL_FUNC: Record<ColorSpace, string> = {
  rgb: 'rgb',
  hsl: 'hsl',
  oklch: 'oklch',
};

interface SameSpaceParse {
  parts: string[];
  alpha: string | null;
}

/**
 * Parse a native CSS color function ONLY when its name matches the configured
 * output space. Splits arguments at the top level, preserving every token
 * (numbers, percentages, `var()`, `calc()`, `min()`, …) verbatim — no numeric
 * parsing or normalization is performed.
 *
 * Returns null when the input is not a same-space function (caller falls back
 * to the sRGB round-trip for genuine cross-space conversion / hex / named colors).
 */
function parseSameSpaceFunc(
  color: string,
  space: ColorSpace,
): SameSpaceParse | null {
  // Match the function name case-insensitively, but tokenize the ORIGINAL
  // string: CSS custom-property names are case-sensitive, so lowercasing the
  // whole value would corrupt tokens like `var(--myHue)`.
  const original = color.trim();
  const lower = original.toLowerCase();
  const funcs = SPACE_FUNCS[space];

  let funcName: string | null = null;
  for (const f of funcs) {
    if (lower.startsWith(`${f}(`)) {
      funcName = f;
      break;
    }
  }
  if (!funcName) return null;

  const start = funcName.length;
  const end = original.lastIndexOf(')');
  if (end < start) return null;
  const inner = original.slice(start + 1, end).trim();
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

  return { parts, alpha };
}

function buildSameSpaceString(
  parsed: SameSpaceParse,
  space: ColorSpace,
): string {
  const func = CANONICAL_FUNC[space];
  const body = parsed.parts.join(' ');
  return parsed.alpha != null
    ? `${func}(${body} / ${parsed.alpha})`
    : `${func}(${body})`;
}

/**
 * Build the decomposed component list for a same-space value.
 *
 * Dynamic tokens (`var()` / `calc()` / …) are preserved verbatim — they can't
 * be parsed and must survive into the CSS output. Purely static components are
 * normalized to the canonical numeric form for the space so the companion
 * `--*-color-{space}` variable stays a valid `<number>+` value (rgb/oklch) —
 * WITHOUT round-tripping through sRGB, which would clamp wide-gamut oklch.
 *
 * Non-native, parse-time-only functions (`okhsl()` / `okhst()`) are always
 * resolved to a static `rgb(...%)` upstream, so this is the path that turns
 * their percentage channels back into 0-255 numbers.
 */
function buildSameSpaceComponents(
  parsed: SameSpaceParse,
  space: ColorSpace,
): string {
  const parts = parsed.parts;

  // Any nested function → can't normalize numerically; preserve verbatim.
  if (parts.some((p) => p.includes('('))) {
    return parts.join(' ');
  }

  switch (space) {
    case 'rgb':
      return parts
        .map((p) =>
          p.endsWith('%') ? formatRgbComponent((parseFloat(p) / 100) * 255) : p,
        )
        .join(' ');
    case 'hsl':
      // hsl components are `h s% l%`; saturation/lightness keep their percent
      // units, so the static tokens are already canonical.
      return parts.join(' ');
    case 'oklch': {
      // Preserve chroma and hue verbatim (no sRGB clamp). A percentage
      // lightness maps to its 0-1 number so the component stays `<number>+`.
      const [l, c, h] = parts;
      const lNorm = l.endsWith('%') ? formatNum(parseFloat(l) / 100, 5) : l;
      return [lNorm, c, h].join(' ');
    }
  }
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
  const sameSpace = parseSameSpaceFunc(color, currentColorSpace);
  if (sameSpace) {
    const result = buildSameSpaceString(sameSpace, currentColorSpace);
    colorSpaceCache.set(color, result);
    return result;
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
 * Extract the decomposed components of a color in the configured color space.
 * Returns a space-separated string of components without the wrapping function.
 * Alpha is NOT included — components are used for alpha composition via `/ alpha`.
 */
export function getColorSpaceComponents(color: string): string {
  const cached = componentsCache.get(color);
  if (cached !== undefined) return cached;

  // Same-space fast path (see strToColorSpace): derive components without a
  // gamut-clamping sRGB round-trip. Dynamic tokens are kept verbatim; static
  // channels are normalized to canonical numbers.
  const sameSpace = parseSameSpaceFunc(color, currentColorSpace);
  if (sameSpace) {
    const result = buildSameSpaceComponents(sameSpace, currentColorSpace);
    componentsCache.set(color, result);
    return result;
  }

  const rgba = resolveToRgbaValues(color);
  if (!rgba) return color;

  const result = rgbValuesToComponents(
    rgba[0],
    rgba[1],
    rgba[2],
    currentColorSpace,
  );
  componentsCache.set(color, result);
  return result;
}

/**
 * Convert a color initial value (from @property definitions) to components
 * in the configured color space.
 */
export function colorInitialValueToComponents(
  initialValue: string | number | undefined,
): string {
  if (initialValue == null) return getDefaultComponents();

  const val = String(initialValue).trim().toLowerCase();

  if (val === 'transparent' || val === 'rgba(0,0,0,0)' || val === '') {
    return getDefaultComponents();
  }

  if (val === 'white') {
    return rgbValuesToComponents(255, 255, 255, currentColorSpace);
  }
  if (val === 'black') {
    return rgbValuesToComponents(0, 0, 0, currentColorSpace);
  }

  const rgbMatch = val.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgbMatch) {
    return rgbValuesToComponents(
      parseInt(rgbMatch[1]),
      parseInt(rgbMatch[2]),
      parseInt(rgbMatch[3]),
      currentColorSpace,
    );
  }

  return getDefaultComponents();
}

function getDefaultComponents(): string {
  switch (currentColorSpace) {
    case 'rgb':
      return '0 0 0';
    case 'hsl':
      return '0 0% 0%';
    case 'oklch':
      return '0 0 0';
  }
}

/**
 * Get the CSS @property syntax for the companion components variable.
 * RGB and OKLCH components are all plain numbers, so `<number>+` works.
 * HSL includes percentages (`h s% l%`), so `*` is the only safe choice.
 */
export function getComponentPropertySyntax(): string {
  switch (currentColorSpace) {
    case 'rgb':
    case 'oklch':
      return '<number>+';
    default:
      return '*';
  }
}
