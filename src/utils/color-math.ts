/**
 * Consolidated color conversion math.
 *
 * Single source of truth for all color space conversions used across the
 * library: sRGB gamma, HSL, OKLab, OKLCH, OKHSL, hex parsing, named
 * colors, and CSS string converters.
 *
 * This module has zero internal imports — it is a leaf dependency.
 *
 * Reference: https://bottosson.github.io/posts/oklab/
 */

// ============================================================================
// Types
// ============================================================================

type Vec3 = [number, number, number];

// ============================================================================
// Conversion Matrices
// ============================================================================

const OKLab_to_LMS_M: Vec3[] = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

const LMS_to_linear_sRGB_M: Vec3[] = [
  [4.076741636075959, -3.307711539258062, 0.2309699031821041],
  [-1.2684379732850313, 2.6097573492876878, -0.3413193760026569],
  [-0.004196076138675526, -0.703418617935936, 1.7076146940746113],
];

const OKLab_to_linear_sRGB_coefficients: [
  [[number, number], number[]],
  [[number, number], number[]],
  [[number, number], number[]],
] = [
  [
    [-1.8817030993265873, -0.8093650129914302],
    [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245],
  ],
  [
    [1.8144407988010998, -1.194452667805235],
    [0.73956515, -0.45954404, 0.08285427, 0.1254107, 0.14503204],
  ],
  [
    [0.13110757611180954, 1.813339709266608],
    [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167],
  ],
];

// ============================================================================
// Linear Algebra Helpers
// ============================================================================

const dotXY = (a: [number, number], b: [number, number]): number =>
  a[0] * b[0] + a[1] * b[1];

// ============================================================================
// sRGB Gamma <-> Linear
// ============================================================================

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const INV_GAMMA = 1 / 2.4;

export function srgbLinearToGamma(val: number): number {
  const sign = val < 0 ? -1 : 1;
  const abs = Math.abs(val);
  return abs > 0.0031308
    ? sign * (1.055 * abs ** INV_GAMMA - 0.055)
    : 12.92 * val;
}

// ============================================================================
// OKHSL Constants & Helpers
// ============================================================================

const TAU = 2 * Math.PI;
const K1 = 0.206;
const K2 = 0.03;
const K3 = (1.0 + K1) / (1.0 + K2);
const EPSILON = 1e-10;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(Math.min(value, max), min);

const constrainAngle = (angle: number): number => ((angle % 360) + 360) % 360;

const toe = (x: number): number =>
  0.5 *
  (K3 * x - K1 + Math.sqrt((K3 * x - K1) * (K3 * x - K1) + 4 * K2 * K3 * x));

const toeInv = (x: number): number => (x ** 2 + K1 * x) / (K3 * (x + K2));

// ============================================================================
// OKHST Tone Transfers
// ============================================================================

export const OKHST_REF_EPS = 0.05;

export function lToY(l: number): number {
  const L = toeInv(l);
  return L * L * L;
}

export function yToL(y: number): number {
  return toe(Math.cbrt(Math.max(0, y)));
}

export function toneFromY(y: number, eps: number = OKHST_REF_EPS): number {
  const num = Math.log(y + eps) - Math.log(eps);
  const den = Math.log(1 + eps) - Math.log(eps);
  return (num / den) * 100;
}

export function yFromTone(t: number, eps: number = OKHST_REF_EPS): number {
  const den = Math.log(1 + eps) - Math.log(eps);
  return Math.exp((t / 100) * den + Math.log(eps)) - eps;
}

export function toTone(l: number, eps: number = OKHST_REF_EPS): number {
  return toneFromY(lToY(l), eps);
}

export function fromTone(t: number, eps: number = OKHST_REF_EPS): number {
  return yToL(yFromTone(t, eps));
}

// ============================================================================
// OKLab <-> Linear sRGB
// ============================================================================

const oklabToLinearSrgb = (lab: Vec3): Vec3 => {
  const L = lab[0];
  const a = lab[1];
  const b = lab[2];

  // OKLab -> LMS (inlined OKLab_to_LMS_M multiply)
  const l_ = L + 0.3963377773761749 * a + 0.2158037573099136 * b;
  const m_ = L - 0.1055613458156586 * a - 0.0638541728258133 * b;
  const s_ = L - 0.0894841775298119 * a - 1.2914855480194092 * b;

  // Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear sRGB (inlined LMS_to_linear_sRGB_M multiply)
  return [
    4.076741636075959 * l - 3.307711539258062 * m + 0.2309699031821041 * s,
    -1.2684379732850313 * l + 2.6097573492876878 * m - 0.3413193760026569 * s,
    -0.004196076138675526 * l - 0.703418617935936 * m + 1.7076146940746113 * s,
  ];
};

const linearSrgbToOklab = (rgb: Vec3): Vec3 => {
  const r = rgb[0];
  const g = rgb[1];
  const b = rgb[2];

  // linear sRGB -> LMS (inlined linear_sRGB_to_LMS_M multiply)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  // Cube root
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  // LMS -> OKLab (inlined LMS_to_OKLab_M multiply)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
};

// ============================================================================
// OKHSL Gamut-Mapping Internals
// ============================================================================

const computeMaxSaturationOKLC = (a: number, b: number): number => {
  const okCoeff = OKLab_to_linear_sRGB_coefficients;
  const lmsToRgb = LMS_to_linear_sRGB_M;
  const tmp2: [number, number] = [a, b];
  const tmp3: Vec3 = [0, a, b];

  let chnlCoeff: number[];
  let chnlLMS: Vec3;

  if (dotXY(okCoeff[0][0], tmp2) > 1) {
    chnlCoeff = okCoeff[0][1];
    chnlLMS = lmsToRgb[0];
  } else if (dotXY(okCoeff[1][0], tmp2) > 1) {
    chnlCoeff = okCoeff[1][1];
    chnlLMS = lmsToRgb[1];
  } else {
    chnlCoeff = okCoeff[2][1];
    chnlLMS = lmsToRgb[2];
  }

  const [k0, k1, k2, k3, k4] = chnlCoeff;
  const [wl, wm, ws] = chnlLMS;

  let sat = k0 + k1 * a + k2 * b + k3 * (a * a) + k4 * a * b;

  const dotYZ = (mat: Vec3, vec: Vec3): number =>
    mat[1] * vec[1] + mat[2] * vec[2];

  const kl = dotYZ(OKLab_to_LMS_M[0], tmp3);
  const km = dotYZ(OKLab_to_LMS_M[1], tmp3);
  const ks = dotYZ(OKLab_to_LMS_M[2], tmp3);

  const l_ = 1.0 + sat * kl;
  const m_ = 1.0 + sat * km;
  const s_ = 1.0 + sat * ks;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lds = 3.0 * kl * (l_ * l_);
  const mds = 3.0 * km * (m_ * m_);
  const sds = 3.0 * ks * (s_ * s_);

  const lds2 = 6.0 * (kl * kl) * l_;
  const mds2 = 6.0 * (km * km) * m_;
  const sds2 = 6.0 * (ks * ks) * s_;

  const f = wl * l + wm * m + ws * s;
  const f1 = wl * lds + wm * mds + ws * sds;
  const f2 = wl * lds2 + wm * mds2 + ws * sds2;

  sat = sat - (f * f1) / (f1 * f1 - 0.5 * f * f2);

  return sat;
};

const findCuspOKLCH = (a: number, b: number): [number, number] => {
  const S_cusp = computeMaxSaturationOKLC(a, b);
  const lab: Vec3 = [1, S_cusp * a, S_cusp * b];
  const rgb_at_max = oklabToLinearSrgb(lab);
  const L_cusp = Math.cbrt(
    1 /
      Math.max(
        Math.max(rgb_at_max[0], rgb_at_max[1]),
        Math.max(rgb_at_max[2], 0.0),
      ),
  );
  return [L_cusp, L_cusp * S_cusp];
};

const findGamutIntersectionOKLCH = (
  a: number,
  b: number,
  l1: number,
  c1: number,
  l0: number,
  cusp: [number, number],
): number => {
  const lmsToRgb = LMS_to_linear_sRGB_M;
  const tmp3: Vec3 = [0, a, b];
  const floatMax = Number.MAX_VALUE;

  let t: number;

  const dotYZ = (mat: Vec3, vec: Vec3): number =>
    mat[1] * vec[1] + mat[2] * vec[2];
  const dotXYZ = (vec: Vec3, x: number, y: number, z: number): number =>
    vec[0] * x + vec[1] * y + vec[2] * z;

  if ((l1 - l0) * cusp[1] - (cusp[0] - l0) * c1 <= 0.0) {
    const denom = c1 * cusp[0] + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * l0) / denom;
  } else {
    const denom = c1 * (cusp[0] - 1.0) + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * (l0 - 1.0)) / denom;

    const dl = l1 - l0;
    const dc = c1;

    const kl = dotYZ(OKLab_to_LMS_M[0], tmp3);
    const km = dotYZ(OKLab_to_LMS_M[1], tmp3);
    const ks = dotYZ(OKLab_to_LMS_M[2], tmp3);

    const ldt_ = dl + dc * kl;
    const mdt_ = dl + dc * km;
    const sdt_ = dl + dc * ks;

    const L = l0 * (1.0 - t) + t * l1;
    const C = t * c1;

    const l_ = L + C * kl;
    const m_ = L + C * km;
    const s_ = L + C * ks;

    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;

    const ldt = 3 * ldt_ * l_ * l_;
    const mdt = 3 * mdt_ * m_ * m_;
    const sdt = 3 * sdt_ * s_ * s_;

    const ldt2 = 6 * ldt_ * ldt_ * l_;
    const mdt2 = 6 * mdt_ * mdt_ * m_;
    const sdt2 = 6 * sdt_ * sdt_ * s_;

    const r_ = dotXYZ(lmsToRgb[0], l, m, s) - 1;
    const r1 = dotXYZ(lmsToRgb[0], ldt, mdt, sdt);
    const r2 = dotXYZ(lmsToRgb[0], ldt2, mdt2, sdt2);

    const ur = r1 / (r1 * r1 - 0.5 * r_ * r2);
    let tr = -r_ * ur;

    const g_ = dotXYZ(lmsToRgb[1], l, m, s) - 1;
    const g1 = dotXYZ(lmsToRgb[1], ldt, mdt, sdt);
    const g2 = dotXYZ(lmsToRgb[1], ldt2, mdt2, sdt2);

    const ug = g1 / (g1 * g1 - 0.5 * g_ * g2);
    let tg = -g_ * ug;

    const b_ = dotXYZ(lmsToRgb[2], l, m, s) - 1;
    const b1 = dotXYZ(lmsToRgb[2], ldt, mdt, sdt);
    const b2 = dotXYZ(lmsToRgb[2], ldt2, mdt2, sdt2);

    const ub = b1 / (b1 * b1 - 0.5 * b_ * b2);
    let tb = -b_ * ub;

    tr = ur >= 0.0 ? tr : floatMax;
    tg = ug >= 0.0 ? tg : floatMax;
    tb = ub >= 0.0 ? tb : floatMax;

    t += Math.min(tr, Math.min(tg, tb));
  }

  return t;
};

const computeSt = (cusp: [number, number]): [number, number] => [
  cusp[1] / cusp[0],
  cusp[1] / (1 - cusp[0]),
];

const computeStMid = (a: number, b: number): [number, number] => [
  0.11516993 +
    1.0 /
      (7.4477897 +
        4.1590124 * b +
        a *
          (-2.19557347 +
            1.75198401 * b +
            a *
              (-2.13704948 -
                10.02301043 * b +
                a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a)))),
  0.11239642 +
    1.0 /
      (1.6132032 -
        0.68124379 * b +
        a *
          (0.40370612 +
            0.90148123 * b +
            a *
              (-0.27087943 +
                0.6122399 * b +
                a * (0.00299215 - 0.45399568 * b - 0.14661872 * a)))),
];

const getCs = (
  L: number,
  a: number,
  b: number,
  cusp: [number, number],
): [number, number, number] => {
  const cMax = findGamutIntersectionOKLCH(a, b, L, 1, L, cusp);
  const stMax = computeSt(cusp);
  const k = cMax / Math.min(L * stMax[0], (1 - L) * stMax[1]);
  const stMid = computeStMid(a, b);
  let ca = L * stMid[0];
  let cb = (1.0 - L) * stMid[1];
  const cMid =
    0.9 * k * Math.sqrt(Math.sqrt(1.0 / (1.0 / ca ** 4 + 1.0 / cb ** 4)));
  ca = L * 0.4;
  cb = (1.0 - L) * 0.8;
  const c0 = Math.sqrt(1.0 / (1.0 / ca ** 2 + 1.0 / cb ** 2));
  return [c0, cMid, cMax];
};

const okhslToOklab = (hsl: Vec3): Vec3 => {
  let h = hsl[0];
  const s = hsl[1];
  const l = hsl[2];

  const L = toeInv(l);
  let a = 0;
  let b = 0;

  h = constrainAngle(h) / 360.0;

  if (L !== 0.0 && L !== 1.0 && s !== 0) {
    const a_ = Math.cos(TAU * h);
    const b_ = Math.sin(TAU * h);

    const cusp = findCuspOKLCH(a_, b_);
    const Cs = getCs(L, a_, b_, cusp);
    const [c0, cMid, cMax] = Cs;

    const mid = 0.8;
    const midInv = 1.25;
    let t: number, k0: number, k1: number, k2: number;

    if (s < mid) {
      t = midInv * s;
      k0 = 0.0;
      k1 = mid * c0;
      k2 = 1.0 - k1 / cMid;
    } else {
      t = 5 * (s - 0.8);
      k0 = cMid;
      k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
      k2 = 1.0 - k1 / (cMax - cMid);
    }

    const c = k0 + (t * k1) / (1.0 - k2 * t);
    a = c * a_;
    b = c * b_;
  }

  return [L, a, b];
};

const oklabToOkhsl = (lab: Vec3): Vec3 => {
  const L = lab[0];
  const a = lab[1];
  const b = lab[2];

  const C = Math.sqrt(a * a + b * b);

  if (C < EPSILON) {
    return [0, 0, toe(L)];
  }

  const a_ = a / C;
  const b_ = b / C;

  let h = Math.atan2(b, a) * (180 / Math.PI);
  h = constrainAngle(h);

  const cusp = findCuspOKLCH(a_, b_);
  const Cs = getCs(L, a_, b_, cusp);
  const [c0, cMid, cMax] = Cs;

  const mid = 0.8;
  const midInv = 1.25;

  let s: number;

  if (C < cMid) {
    const k1 = mid * c0;
    const k2 = 1.0 - k1 / cMid;
    const t = C / (k1 + C * k2);
    s = t / midInv;
  } else {
    const k0 = cMid;
    const k1 = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
    const k2 = 1.0 - k1 / (cMax - cMid);
    const cDiff = C - k0;
    const t = cDiff / (k1 + cDiff * k2);
    s = mid + t / 5;
  }

  const l = toe(L);

  return [h, clamp(s, 0, 1), clamp(l, 0, 1)];
};

// ============================================================================
// Public Conversions — Pure Math (Vec3 in / Vec3 out)
// ============================================================================

/**
 * HSL to RGB.
 * Algorithm from CSS Color 4 spec.
 *
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation (0-1)
 * @param l - Lightness (0-1)
 * @returns RGB values in 0-255 range (may have fractional values)
 */
export function hslToRgbValues(h: number, s: number, l: number): Vec3 {
  const a = s * Math.min(l, 1 - l);

  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };

  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * RGB (0-255) to HSL.
 * @returns [h (0-360), s (0-1), l (0-1)]
 */
export function rgbToHsl(r: number, g: number, b: number): Vec3 {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return [h * 360, s, l];
}

/**
 * RGB (0-255) to OKLCH via sRGB -> linear sRGB -> OKLab -> OKLCH.
 * @returns [L, C, H] where H is in degrees (0-360)
 */
export function rgbToOklch(r: number, g: number, b: number): Vec3 {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const linear: Vec3 = [lr, lg, lb];
  const lab = linearSrgbToOklab(linear);

  const [L, a, bLab] = lab;
  const C = Math.sqrt(a * a + bLab * bLab);
  let H = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return [L, C, H];
}

/**
 * OKHSL to sRGB (0-1 range).
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation (0-1)
 * @param l - Lightness (0-1)
 * @returns sRGB values in 0-1 range, clamped to gamut
 */
export function okhslToSrgb(h: number, s: number, l: number): Vec3 {
  const oklab = okhslToOklab([h, s, l]);
  const linearRGB = oklabToLinearSrgb(oklab);

  return [
    clamp(srgbLinearToGamma(linearRGB[0]), 0, 1),
    clamp(srgbLinearToGamma(linearRGB[1]), 0, 1),
    clamp(srgbLinearToGamma(linearRGB[2]), 0, 1),
  ];
}

/**
 * OKHST to sRGB (0-1 range).
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation (0-1)
 * @param t - Tone (0-1)
 * @returns sRGB values in 0-1 range, clamped to gamut
 */
export function okhstToSrgb(h: number, s: number, t: number): Vec3 {
  return okhslToSrgb(h, clamp(s, 0, 1), clamp(fromTone(t * 100), 0, 1));
}

/**
 * OKLCH to sRGB (0-255 range).
 * @param L - Lightness (0-1)
 * @param C - Chroma (typically 0-0.4)
 * @param H - Hue in degrees (0-360)
 * @returns RGB values in 0-255 range, clamped to gamut
 */
export function oklchToRgbValues(L: number, C: number, H: number): Vec3 {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const linear = oklabToLinearSrgb([L, a, b]);

  return [
    clamp(srgbLinearToGamma(linear[0]), 0, 1) * 255,
    clamp(srgbLinearToGamma(linear[1]), 0, 1) * 255,
    clamp(srgbLinearToGamma(linear[2]), 0, 1) * 255,
  ];
}

/**
 * sRGB (0-1 range) to OKHSL.
 * @returns [H (0-360), S (0-1), L (0-1)]
 */
export function srgbToOkhsl(rgb: Vec3): Vec3 {
  const linear: Vec3 = [
    srgbToLinear(rgb[0]),
    srgbToLinear(rgb[1]),
    srgbToLinear(rgb[2]),
  ];
  const oklab = linearSrgbToOklab(linear);
  return oklabToOkhsl(oklab);
}

// ============================================================================
// Named CSS Colors
// ============================================================================

let _namedColorHex: Map<string, string> | null = null;

export function getNamedColorHex(): Map<string, string> {
  if (_namedColorHex) return _namedColorHex;
  _namedColorHex = new Map([
    ['aliceblue', '#f0f8ff'],
    ['antiquewhite', '#faebd7'],
    ['aqua', '#00ffff'],
    ['aquamarine', '#7fffd4'],
    ['azure', '#f0ffff'],
    ['beige', '#f5f5dc'],
    ['bisque', '#ffe4c4'],
    ['black', '#000000'],
    ['blanchedalmond', '#ffebcd'],
    ['blue', '#0000ff'],
    ['blueviolet', '#8a2be2'],
    ['brown', '#a52a2a'],
    ['burlywood', '#deb887'],
    ['cadetblue', '#5f9ea0'],
    ['chartreuse', '#7fff00'],
    ['chocolate', '#d2691e'],
    ['coral', '#ff7f50'],
    ['cornflowerblue', '#6495ed'],
    ['cornsilk', '#fff8dc'],
    ['crimson', '#dc143c'],
    ['cyan', '#00ffff'],
    ['darkblue', '#00008b'],
    ['darkcyan', '#008b8b'],
    ['darkgoldenrod', '#b8860b'],
    ['darkgray', '#a9a9a9'],
    ['darkgreen', '#006400'],
    ['darkgrey', '#a9a9a9'],
    ['darkkhaki', '#bdb76b'],
    ['darkmagenta', '#8b008b'],
    ['darkolivegreen', '#556b2f'],
    ['darkorange', '#ff8c00'],
    ['darkorchid', '#9932cc'],
    ['darkred', '#8b0000'],
    ['darksalmon', '#e9967a'],
    ['darkseagreen', '#8fbc8f'],
    ['darkslateblue', '#483d8b'],
    ['darkslategray', '#2f4f4f'],
    ['darkslategrey', '#2f4f4f'],
    ['darkturquoise', '#00ced1'],
    ['darkviolet', '#9400d3'],
    ['deeppink', '#ff1493'],
    ['deepskyblue', '#00bfff'],
    ['dimgray', '#696969'],
    ['dimgrey', '#696969'],
    ['dodgerblue', '#1e90ff'],
    ['firebrick', '#b22222'],
    ['floralwhite', '#fffaf0'],
    ['forestgreen', '#228b22'],
    ['fuchsia', '#ff00ff'],
    ['gainsboro', '#dcdcdc'],
    ['ghostwhite', '#f8f8ff'],
    ['gold', '#ffd700'],
    ['goldenrod', '#daa520'],
    ['gray', '#808080'],
    ['green', '#008000'],
    ['greenyellow', '#adff2f'],
    ['grey', '#808080'],
    ['honeydew', '#f0fff0'],
    ['hotpink', '#ff69b4'],
    ['indianred', '#cd5c5c'],
    ['indigo', '#4b0082'],
    ['ivory', '#fffff0'],
    ['khaki', '#f0e68c'],
    ['lavender', '#e6e6fa'],
    ['lavenderblush', '#fff0f5'],
    ['lawngreen', '#7cfc00'],
    ['lemonchiffon', '#fffacd'],
    ['lightblue', '#add8e6'],
    ['lightcoral', '#f08080'],
    ['lightcyan', '#e0ffff'],
    ['lightgoldenrodyellow', '#fafad2'],
    ['lightgray', '#d3d3d3'],
    ['lightgreen', '#90ee90'],
    ['lightgrey', '#d3d3d3'],
    ['lightpink', '#ffb6c1'],
    ['lightsalmon', '#ffa07a'],
    ['lightseagreen', '#20b2aa'],
    ['lightskyblue', '#87cefa'],
    ['lightslategray', '#778899'],
    ['lightslategrey', '#778899'],
    ['lightsteelblue', '#b0c4de'],
    ['lightyellow', '#ffffe0'],
    ['lime', '#00ff00'],
    ['limegreen', '#32cd32'],
    ['linen', '#faf0e6'],
    ['magenta', '#ff00ff'],
    ['maroon', '#800000'],
    ['mediumaquamarine', '#66cdaa'],
    ['mediumblue', '#0000cd'],
    ['mediumorchid', '#ba55d3'],
    ['mediumpurple', '#9370db'],
    ['mediumseagreen', '#3cb371'],
    ['mediumslateblue', '#7b68ee'],
    ['mediumspringgreen', '#00fa9a'],
    ['mediumturquoise', '#48d1cc'],
    ['mediumvioletred', '#c71585'],
    ['midnightblue', '#191970'],
    ['mintcream', '#f5fffa'],
    ['mistyrose', '#ffe4e1'],
    ['moccasin', '#ffe4b5'],
    ['navajowhite', '#ffdead'],
    ['navy', '#000080'],
    ['oldlace', '#fdf5e6'],
    ['olive', '#808000'],
    ['olivedrab', '#6b8e23'],
    ['orange', '#ffa500'],
    ['orangered', '#ff4500'],
    ['orchid', '#da70d6'],
    ['palegoldenrod', '#eee8aa'],
    ['palegreen', '#98fb98'],
    ['paleturquoise', '#afeeee'],
    ['palevioletred', '#db7093'],
    ['papayawhip', '#ffefd5'],
    ['peachpuff', '#ffdab9'],
    ['peru', '#cd853f'],
    ['pink', '#ffc0cb'],
    ['plum', '#dda0dd'],
    ['powderblue', '#b0e0e6'],
    ['purple', '#800080'],
    ['rebeccapurple', '#663399'],
    ['red', '#ff0000'],
    ['rosybrown', '#bc8f8f'],
    ['royalblue', '#4169e1'],
    ['saddlebrown', '#8b4513'],
    ['salmon', '#fa8072'],
    ['sandybrown', '#f4a460'],
    ['seagreen', '#2e8b57'],
    ['seashell', '#fff5ee'],
    ['sienna', '#a0522d'],
    ['silver', '#c0c0c0'],
    ['skyblue', '#87ceeb'],
    ['slateblue', '#6a5acd'],
    ['slategray', '#708090'],
    ['slategrey', '#708090'],
    ['snow', '#fffafa'],
    ['springgreen', '#00ff7f'],
    ['steelblue', '#4682b4'],
    ['tan', '#d2b48c'],
    ['teal', '#008080'],
    ['thistle', '#d8bfd8'],
    ['tomato', '#ff6347'],
    ['turquoise', '#40e0d0'],
    ['violet', '#ee82ee'],
    ['wheat', '#f5deb3'],
    ['white', '#ffffff'],
    ['whitesmoke', '#f5f5f5'],
    ['yellow', '#ffff00'],
    ['yellowgreen', '#9acd32'],
  ]);
  return _namedColorHex;
}

// ============================================================================
// String Converters
// ============================================================================

const hexCharToNum = (c: number): number => {
  if (c >= 48 && c <= 57) return c - 48; // 0-9
  if (c >= 65 && c <= 70) return c - 55; // A-F
  if (c >= 97 && c <= 102) return c - 87; // a-f
  return -1;
};

/**
 * Parse a hex color string directly to RGB 0-255 values.
 * Supports 3, 4, 6, and 8 character hex values (with or without `#`).
 * Returns null for invalid input.
 */
export function hexToRgbValues(hex: string): Vec3 | null {
  let start = 0;
  if (hex.charCodeAt(0) === 35) start = 1; // '#'
  const len = hex.length - start;

  if (len === 3 || len === 4) {
    const r = hexCharToNum(hex.charCodeAt(start));
    const g = hexCharToNum(hex.charCodeAt(start + 1));
    const b = hexCharToNum(hex.charCodeAt(start + 2));
    if (r < 0 || g < 0 || b < 0) return null;
    return [r * 17, g * 17, b * 17];
  }

  if (len === 6 || len === 8) {
    const r1 = hexCharToNum(hex.charCodeAt(start));
    const r2 = hexCharToNum(hex.charCodeAt(start + 1));
    const g1 = hexCharToNum(hex.charCodeAt(start + 2));
    const g2 = hexCharToNum(hex.charCodeAt(start + 3));
    const b1 = hexCharToNum(hex.charCodeAt(start + 4));
    const b2 = hexCharToNum(hex.charCodeAt(start + 5));
    if (r1 < 0 || r2 < 0 || g1 < 0 || g2 < 0 || b1 < 0 || b2 < 0) return null;
    return [r1 * 16 + r2, g1 * 16 + g2, b1 * 16 + b2];
  }

  return null;
}

/**
 * Parse a hex color string to RGBA values (RGB 0-255, alpha 0-1).
 * Supports 3, 4, 6, and 8 character hex values (with or without `#`).
 * For 3/6-char hex (no alpha channel), alpha defaults to 1.
 */
export function hexToRgbaValues(
  hex: string,
): [number, number, number, number] | null {
  let start = 0;
  if (hex.charCodeAt(0) === 35) start = 1; // '#'
  const len = hex.length - start;

  if (len === 3) {
    const r = hexCharToNum(hex.charCodeAt(start));
    const g = hexCharToNum(hex.charCodeAt(start + 1));
    const b = hexCharToNum(hex.charCodeAt(start + 2));
    if (r < 0 || g < 0 || b < 0) return null;
    return [r * 17, g * 17, b * 17, 1];
  }

  if (len === 4) {
    const r = hexCharToNum(hex.charCodeAt(start));
    const g = hexCharToNum(hex.charCodeAt(start + 1));
    const b = hexCharToNum(hex.charCodeAt(start + 2));
    const a = hexCharToNum(hex.charCodeAt(start + 3));
    if (r < 0 || g < 0 || b < 0 || a < 0) return null;
    return [r * 17, g * 17, b * 17, (a * 17) / 255];
  }

  if (len === 6) {
    const r1 = hexCharToNum(hex.charCodeAt(start));
    const r2 = hexCharToNum(hex.charCodeAt(start + 1));
    const g1 = hexCharToNum(hex.charCodeAt(start + 2));
    const g2 = hexCharToNum(hex.charCodeAt(start + 3));
    const b1 = hexCharToNum(hex.charCodeAt(start + 4));
    const b2 = hexCharToNum(hex.charCodeAt(start + 5));
    if (r1 < 0 || r2 < 0 || g1 < 0 || g2 < 0 || b1 < 0 || b2 < 0) return null;
    return [r1 * 16 + r2, g1 * 16 + g2, b1 * 16 + b2, 1];
  }

  if (len === 8) {
    const r1 = hexCharToNum(hex.charCodeAt(start));
    const r2 = hexCharToNum(hex.charCodeAt(start + 1));
    const g1 = hexCharToNum(hex.charCodeAt(start + 2));
    const g2 = hexCharToNum(hex.charCodeAt(start + 3));
    const b1 = hexCharToNum(hex.charCodeAt(start + 4));
    const b2 = hexCharToNum(hex.charCodeAt(start + 5));
    const a1 = hexCharToNum(hex.charCodeAt(start + 6));
    const a2 = hexCharToNum(hex.charCodeAt(start + 7));
    if (
      r1 < 0 ||
      r2 < 0 ||
      g1 < 0 ||
      g2 < 0 ||
      b1 < 0 ||
      b2 < 0 ||
      a1 < 0 ||
      a2 < 0
    )
      return null;
    return [r1 * 16 + r2, g1 * 16 + g2, b1 * 16 + b2, (a1 * 16 + a2) / 255];
  }

  return null;
}

/**
 * Convert hex color string to `rgb()` CSS string.
 * Supports 3, 4, 6, and 8 character hex values (with or without `#`).
 */
export function hexToRgb(hex: string): string | null {
  const matched = hex
    .replace(
      /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
      (_m: string, r: string, g: string, b: string) =>
        '#' + r + r + g + g + b + b,
    )
    .substring(1)
    .match(/.{2}/g);

  if (!matched) return null;

  const rgba = matched.map(
    (x: string, i: number) => parseInt(x, 16) * (i === 3 ? 1 / 255 : 1),
  );

  if (rgba.some((v) => Number.isNaN(v))) {
    return null;
  }

  if (rgba.length >= 3) {
    return `rgb(${rgba.slice(0, 3).join(' ')}${rgba.length > 3 ? ` / ${rgba[3]}` : ''})`;
  }

  return null;
}

/**
 * Extract RGB values from an `rgb()`/`rgba()` string.
 * Supports comma-separated, space-separated, fractional, percentage,
 * and slash alpha notation.
 *
 * @returns Array of RGB values (0-255 range), converting percentages as needed.
 */
export function getRgbValuesFromRgbaString(str: string): number[] {
  const match = str.match(/rgba?\(([^)]+)\)/i);
  if (!match) return [];

  const inner = match[1].trim();
  const [colorPart] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  return parts.slice(0, 3).map((part) => {
    part = part.trim();
    if (part.endsWith('%')) {
      return (parseFloat(part) / 100) * 255;
    }
    return parseFloat(part);
  });
}

/**
 * Convert any recognized color string to an `rgb()` CSS string.
 * Handles hex, `okhsl()`, `okhst()`, `hsl()`/`hsla()`, named CSS colors,
 * and `rgb()`/`rgba()` pass-through.
 */
export function strToRgb(
  color: string,
  _ignoreAlpha = false,
): string | null | undefined {
  if (!color) return undefined;

  if (color.startsWith('rgb')) return color;
  if (color.startsWith('#')) return hexToRgb(color);
  if (color.startsWith('oklch(')) return oklchStringToRgb(color);
  if (color.startsWith('okhsl(')) return okhslStringToRgb(color);
  if (color.startsWith('okhst(')) return okhstStringToRgb(color);
  if (color.startsWith('hsl')) return hslStringToRgb(color);

  const namedHex = getNamedColorHex().get(color.toLowerCase());
  if (namedHex) return hexToRgb(namedHex);

  return null;
}

/**
 * Convert an HSL/HSLA color string to an `rgb()`/`rgba()` CSS string.
 * Supports modern space-separated and legacy comma-separated syntax,
 * deg/turn/rad hue units, and slash alpha notation.
 */
export function hslStringToRgb(hslStr: string): string | null {
  const match = hslStr.match(/hsla?\(([^)]+)\)/i);
  if (!match) return null;

  const inner = match[1].trim();
  const [colorPart, slashAlpha] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  const alphaPart = slashAlpha?.trim() || (parts.length >= 4 ? parts[3] : null);

  let h = parseFloat(parts[0]);
  const hueStr = parts[0].toLowerCase();
  if (hueStr.endsWith('turn')) h = parseFloat(hueStr) * 360;
  else if (hueStr.endsWith('rad')) h = (parseFloat(hueStr) * 180) / Math.PI;
  h = ((h % 360) + 360) % 360;

  const parsePercent = (val: string): number => {
    const num = parseFloat(val);
    return val.includes('%') ? num / 100 : num;
  };
  const s = Math.max(0, Math.min(1, parsePercent(parts[1])));
  const l = Math.max(0, Math.min(1, parsePercent(parts[2])));

  const [r, g, b] = hslToRgbValues(h, s, l);

  if (alphaPart) {
    const alpha = parseFloat(alphaPart.trim());
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  }

  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

/**
 * Convert an `okhsl()` color string to an `rgb()`/`rgba()` CSS string.
 * Supports deg/turn/rad hue units and percentage saturation/lightness.
 */
export function okhslStringToRgb(okhslStr: string): string | null {
  const match = okhslStr.match(/okhsl\(([^)]+)\)/i);
  if (!match) return null;

  const inner = match[1].trim();
  const [colorPart, alphaPart] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  let h = parseFloat(parts[0]);
  const hueStr = parts[0].toLowerCase();
  if (hueStr.endsWith('turn')) h = parseFloat(hueStr) * 360;
  else if (hueStr.endsWith('rad')) h = (parseFloat(hueStr) * 180) / Math.PI;
  else if (hueStr.endsWith('deg')) h = parseFloat(hueStr);

  const parsePercent = (val: string): number => {
    const num = parseFloat(val);
    return val.includes('%') ? num / 100 : num;
  };
  const s = Math.max(0, Math.min(1, parsePercent(parts[1])));
  const l = Math.max(0, Math.min(1, parsePercent(parts[2])));

  const [r, g, b] = okhslToSrgb(h, s, l);

  const r255 = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const g255 = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const b255 = Math.round(Math.max(0, Math.min(1, b)) * 255);

  if (alphaPart) {
    const alpha = parseFloat(alphaPart.trim());
    return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
  }

  return `rgb(${r255} ${g255} ${b255})`;
}

/**
 * Convert an `okhst()` color string to an `rgb()`/`rgba()` CSS string.
 * Supports deg/turn/rad hue units and percentage saturation/tone.
 */
export function okhstStringToRgb(okhstStr: string): string | null {
  const match = okhstStr.match(/okhst\(([^)]+)\)/i);
  if (!match) return null;

  const inner = match[1].trim();
  const [colorPart, alphaPart] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  let h = parseFloat(parts[0]);
  const hueStr = parts[0].toLowerCase();
  if (hueStr.endsWith('turn')) h = parseFloat(hueStr) * 360;
  else if (hueStr.endsWith('rad')) h = (parseFloat(hueStr) * 180) / Math.PI;
  else if (hueStr.endsWith('deg')) h = parseFloat(hueStr);

  const parsePercent = (val: string): number => {
    const num = parseFloat(val);
    return val.includes('%') ? num / 100 : num;
  };
  const s = Math.max(0, Math.min(1, parsePercent(parts[1])));
  const t = Math.max(0, Math.min(1, parsePercent(parts[2])));

  const [r, g, b] = okhstToSrgb(h, s, t);

  const r255 = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const g255 = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const b255 = Math.round(Math.max(0, Math.min(1, b)) * 255);

  if (alphaPart) {
    const alpha = parseFloat(alphaPart.trim());
    return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
  }

  return `rgb(${r255} ${g255} ${b255})`;
}

/**
 * Convert an `oklch()` color string to an `rgb()`/`rgba()` CSS string.
 * Supports deg/turn/rad hue units and percentage lightness.
 */
export function oklchStringToRgb(oklchStr: string): string | null {
  const match = oklchStr.match(/oklch\(([^)]+)\)/i);
  if (!match) return null;

  const inner = match[1].trim();
  const [colorPart, alphaPart] = inner.split('/');
  const parts = colorPart
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean);

  if (parts.length < 3) return null;

  const parsePercent = (val: string): number => {
    const num = parseFloat(val);
    return val.includes('%') ? num / 100 : num;
  };
  const L = Math.max(0, Math.min(1, parsePercent(parts[0])));
  const C = Math.max(0, parseFloat(parts[1]));

  let H = parseFloat(parts[2]);
  const hueStr = parts[2].toLowerCase();
  if (hueStr.endsWith('turn')) H = parseFloat(hueStr) * 360;
  else if (hueStr.endsWith('rad')) H = (parseFloat(hueStr) * 180) / Math.PI;
  else if (hueStr.endsWith('deg')) H = parseFloat(hueStr);

  const [r, g, b] = oklchToRgbValues(L, C, H);

  if (alphaPart) {
    const alpha = parseFloat(alphaPart.trim());
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
  }

  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}
