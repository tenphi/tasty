import { Lru } from '../parser/lru';

import {
  getRgbValuesFromRgbaString,
  hexToRgbValues,
  hslToRgbValues,
  okhslToSrgb,
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

function rgbValuesToColorString(
  r: number,
  g: number,
  b: number,
  space: ColorSpace,
): string {
  switch (space) {
    case 'rgb':
      return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
    case 'hsl': {
      const [h, s, l] = rgbToHsl(r, g, b);
      return `hsl(${formatNum(h, 2)} ${formatNum(s * 100, 2)}% ${formatNum(l * 100, 2)}%)`;
    }
    case 'oklch': {
      const [L, C, H] = rgbToOklch(r, g, b);
      return `oklch(${formatNum(L, 5)} ${formatNum(C, 5)} ${formatNum(H, 2)})`;
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
// Resolve any color input to 0-255 RGB values
// ---------------------------------------------------------------------------

const parseColorFuncArgs = (str: string, prefix: string): string[] | null => {
  const start = str.indexOf('(', prefix.length - 1);
  const end = str.lastIndexOf(')');
  if (start < 0 || end < 0) return null;
  const inner = str.slice(start + 1, end).trim();
  const [colorPart] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);
  return parts.length >= 3 ? parts : null;
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

function resolveToRgbValues(color: string): [number, number, number] | null {
  const trimmed = color.trim().toLowerCase();

  if (trimmed.startsWith('rgb')) {
    const vals = getRgbValuesFromRgbaString(trimmed);
    if (vals.length >= 3) return [vals[0], vals[1], vals[2]];
    return null;
  }

  if (trimmed.startsWith('#')) {
    return hexToRgbValues(trimmed);
  }

  if (trimmed.startsWith('hsl')) {
    const parts = parseColorFuncArgs(trimmed, 'hsl');
    if (!parts) return null;
    const h = parseHue(parts[0]);
    const s = clamp01(parsePercent(parts[1]));
    const l = clamp01(parsePercent(parts[2]));
    return hslToRgbValues(h, s, l);
  }

  if (trimmed.startsWith('oklch(')) {
    const parts = parseColorFuncArgs(trimmed, 'oklch');
    if (!parts) return null;
    const L = clamp01(parsePercent(parts[0]));
    const C = Math.max(0, parseFloat(parts[1]));
    const H = parseHue(parts[2]);
    return oklchToRgbValues(L, C, H);
  }

  if (trimmed.startsWith('okhsl(')) {
    const parts = parseColorFuncArgs(trimmed, 'okhsl');
    if (!parts) return null;
    const h = parseHue(parts[0]);
    const s = clamp01(parsePercent(parts[1]));
    const l = clamp01(parsePercent(parts[2]));
    const [r, g, b] = okhslToSrgb(h, s, l);
    return [clamp01(r) * 255, clamp01(g) * 255, clamp01(b) * 255];
  }

  // Fallback: named colors and other formats go through string conversion
  const fallback = strToRgb(trimmed);
  if (fallback) {
    const vals = getRgbValuesFromRgbaString(fallback);
    if (vals.length >= 3) return [vals[0], vals[1], vals[2]];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert any supported color string to the configured color space CSS format.
 * Returns null if the input cannot be parsed.
 */
export function strToColorSpace(color: string): string | null | undefined {
  if (!color) return undefined;

  const cached = colorSpaceCache.get(color);
  if (cached !== undefined) return cached;

  const rgb = resolveToRgbValues(color);
  if (!rgb) {
    colorSpaceCache.set(color, null);
    return null;
  }

  const result = rgbValuesToColorString(
    rgb[0],
    rgb[1],
    rgb[2],
    currentColorSpace,
  );
  colorSpaceCache.set(color, result);
  return result;
}

/**
 * Extract the decomposed components of a color in the configured color space.
 * Returns a space-separated string of components without the wrapping function.
 */
export function getColorSpaceComponents(color: string): string {
  const cached = componentsCache.get(color);
  if (cached !== undefined) return cached;

  const rgb = resolveToRgbValues(color);
  if (!rgb) return color;

  const result = rgbValuesToComponents(
    rgb[0],
    rgb[1],
    rgb[2],
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
 * For rgb it's `<number>+`, for hsl and oklch we use `*` since
 * the components include percentages or mixed types.
 */
export function getComponentPropertySyntax(): string {
  switch (currentColorSpace) {
    case 'rgb':
      return '<number>+';
    default:
      return '*';
  }
}
