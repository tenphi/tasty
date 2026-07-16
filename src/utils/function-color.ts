import { getGlobalFuncs, getGlobalParser } from './styles';

const RE_FUNC_NAME = /^([a-z][a-z0-9-]*)\s*\(/i;
const RE_COLOR_OUT =
  /^(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\(|^#|^var\(--/i;

/**
 * Resolve a `name(...)` value produced by a registered custom parse function
 * into its concrete color output.
 *
 * A color function is just a `functions` entry whose output is an already
 * supported color (`rgb`, `hsl`, `#…`, `oklch`, …). This helper delegates the
 * value to the global parser (which already runs the registered parse function)
 * and returns the result only when it looks like a color. Returns `null` when
 * `str` is not a registered custom function or its output is not a color.
 *
 * This is the generic replacement for the previously hardcoded okhsl/okhst
 * conversion branches scattered across `strToRgb`, `resolveToRgbaValues`, and
 * the `#token.alpha` injection path.
 */
export function resolveFunctionColor(str: string): string | null {
  const m = RE_FUNC_NAME.exec(str);
  if (!m) return null;

  const name = m[1].toLowerCase();
  // Ensure the global parser (and therefore the default color functions) is
  // initialized before consulting the function registry.
  getGlobalParser();
  const funcs = getGlobalFuncs();
  if (!(name in funcs)) return null;

  const out = getGlobalParser().process(str).output;
  if (!out || !RE_COLOR_OUT.test(out)) return null;

  return out;
}
