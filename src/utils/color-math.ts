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
type Vec2 = [number, number];

// ============================================================================
// Conversion Matrices
// ============================================================================

const OKLab_to_LMS_ab: Vec2[] = [
  [0.3963377773761749, 0.2158037573099136],
  [-0.1055613458156586, -0.0638541728258133],
  [-0.0894841775298119, -1.2914855480194092],
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

const dotXY = (vector: Vec2, x: number, y: number): number =>
  vector[0] * x + vector[1] * y;

const dotXYZ = (matrix: Vec3, x: number, y: number, z: number): number =>
  matrix[0] * x + matrix[1] * y + matrix[2] * z;

// ============================================================================
// sRGB Gamma <-> Linear
// ============================================================================

/**
 * sRGB gamma to linear. Only the sRGB-to-OKLab direction needs it, so this is
 * test-only for the same reason as {@link srgbToOkhsl} — the forward path goes
 * through {@link srgbLinearToGamma} instead.
 */
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

const OKHST_REF_EPS = 0.05;

function lToY(l: number): number {
  const L = toeInv(l);
  return L * L * L;
}

function yToL(y: number): number {
  return toe(Math.cbrt(Math.max(0, y)));
}

function toneFromY(y: number, eps: number = OKHST_REF_EPS): number {
  const num = Math.log(y + eps) - Math.log(eps);
  const den = Math.log(1 + eps) - Math.log(eps);
  return (num / den) * 100;
}

function yFromTone(t: number, eps: number = OKHST_REF_EPS): number {
  const den = Math.log(1 + eps) - Math.log(eps);
  return Math.exp((t / 100) * den + Math.log(eps)) - eps;
}

/**
 * Lightness to OKHST tone — the reverse of {@link fromTone}, which is the
 * direction `okhst()` uses. Kept for the same reason as {@link srgbToOkhsl},
 * and kept out of the build the same way: it lets the forward transfer be
 * round-tripped in tests, and `scripts/check-test-only-code.mjs` verifies it
 * never reaches an emitted file.
 */
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

  let chnlCoeff: number[];
  let chnlLMS: Vec3;

  if (dotXY(okCoeff[0][0], a, b) > 1) {
    chnlCoeff = okCoeff[0][1];
    chnlLMS = lmsToRgb[0];
  } else if (dotXY(okCoeff[1][0], a, b) > 1) {
    chnlCoeff = okCoeff[1][1];
    chnlLMS = lmsToRgb[1];
  } else {
    chnlCoeff = okCoeff[2][1];
    chnlLMS = lmsToRgb[2];
  }

  const [k0, k1, k2, k3, k4] = chnlCoeff;
  const [wl, wm, ws] = chnlLMS;

  let sat = k0 + k1 * a + k2 * b + k3 * (a * a) + k4 * a * b;

  const kl = dotXY(OKLab_to_LMS_ab[0], a, b);
  const km = dotXY(OKLab_to_LMS_ab[1], a, b);
  const ks = dotXY(OKLab_to_LMS_ab[2], a, b);

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

  let t: number;

  if ((l1 - l0) * cusp[1] - (cusp[0] - l0) * c1 <= 0.0) {
    const denom = c1 * cusp[0] + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * l0) / denom;
  } else {
    const denom = c1 * (cusp[0] - 1.0) + cusp[1] * (l0 - l1);
    t = denom === 0 ? 0 : (cusp[1] * (l0 - 1.0)) / denom;

    const dl = l1 - l0;
    const dc = c1;

    const kl = dotXY(OKLab_to_LMS_ab[0], a, b);
    const km = dotXY(OKLab_to_LMS_ab[1], a, b);
    const ks = dotXY(OKLab_to_LMS_ab[2], a, b);

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

    let correction = Number.MAX_VALUE;
    for (const matrix of lmsToRgb) {
      const value = dotXYZ(matrix, l, m, s) - 1;
      const slope = dotXYZ(matrix, ldt, mdt, sdt);
      const slope2 = dotXYZ(matrix, ldt2, mdt2, sdt2);
      const u = slope / (slope * slope - 0.5 * value * slope2);
      if (u >= 0) correction = Math.min(correction, -value * u);
    }
    t += correction;
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
 *
 * The reverse of {@link okhslToSrgb}, which is the direction the `okhsl()`
 * plugin uses. Nothing in the engine calls this — it exists so the forward
 * conversion can be round-tripped in tests, which checks its accuracy without
 * depending on hand-written fixtures.
 *
 * Test-only, and kept out of the build by not being reachable from any package
 * entry point. `scripts/check-test-only-code.mjs` fails the build if that ever
 * stops being true.
 *
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

  // The second string stores one six-digit value for every space-separated
  // name in the first. The table checksum test keeps the packed columns in
  // lockstep while avoiding an object literal in every runtime bundle.
  const names =
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(
      ' ',
    );
  const hex =
    'f0f8fffaebd700ffff7fffd4f0fffff5f5dcffe4c4000000ffebcd0000ff8a2be2a52a2adeb8875f9ea07fff00d2691eff7f506495edfff8dcdc143c00ffff00008b008b8bb8860ba9a9a9006400a9a9a9bdb76b8b008b556b2fff8c009932cc8b0000e9967a8fbc8f483d8b2f4f4f2f4f4f00ced19400d3ff149300bfff6969696969691e90ffb22222fffaf0228b22ff00ffdcdcdcf8f8ffffd700daa520808080008000adff2f808080f0fff0ff69b4cd5c5c4b0082fffff0f0e68ce6e6fafff0f57cfc00fffacdadd8e6f08080e0fffffafad2d3d3d390ee90d3d3d3ffb6c1ffa07a20b2aa87cefa778899778899b0c4deffffe000ff0032cd32faf0e6ff00ff80000066cdaa0000cdba55d39370db3cb3717b68ee00fa9a48d1ccc71585191970f5fffaffe4e1ffe4b5ffdead000080fdf5e68080006b8e23ffa500ff4500da70d6eee8aa98fb98afeeeedb7093ffefd5ffdab9cd853fffc0cbdda0ddb0e0e6800080663399ff0000bc8f8f4169e18b4513fa8072f4a4602e8b57fff5eea0522dc0c0c087ceeb6a5acd708090708090fffafa00ff7f4682b4d2b48c008080d8bfd8ff634740e0d0ee82eef5deb3fffffff5f5f5ffff009acd32';
  const colors = new Map<string, string>();

  for (let i = 0; i < names.length; i++) {
    colors.set(names[i], `#${hex.slice(i * 6, i * 6 + 6)}`);
  }

  return (_namedColorHex = colors);
}

// ============================================================================
// String Converters
// ============================================================================

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
