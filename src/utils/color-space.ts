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
