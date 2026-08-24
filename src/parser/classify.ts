import { getNamedColorHex } from '../utils/color-math';
import { mixColorAlpha, overrideColorAlpha } from '../utils/color-space';
import { getGlobalPredefinedTokens } from '../utils/styles';
import { foldDslCase } from '../utils/string';

import {
  COLOR_FUNCS,
  DERIVED_COLOR_FUNCS,
  POLYMORPHIC_COLOR_FUNC,
  RE_FUNC_CALL,
  RE_HEX,
  RE_NUMBER,
  RE_RAW_UNIT,
  RE_UNIT_NUM,
  VALUE_KEYWORDS,
  canonicalFuncName,
} from './const';
import { StyleParser } from './parser';
import type { ParserOptions, ProcessedStyle } from './types';
import { Bucket } from './types';

/**
 * Convert an opacity suffix to the alpha value it denotes.
 *
 * The authored digits are kept verbatim — `.07` stays `.07` rather than being
 * multiplied into `7.000000000000001%` — and a `$prop` suffix passes the
 * reference straight through, so it works whether the property holds a
 * `<number>` or a `<percentage>`. Both are what the alpha slot accepts.
 */
function alphaSuffixToAlpha(rawAlpha: string): string {
  // Custom property: $disabled -> var(--disabled)
  if (rawAlpha.startsWith('$')) return `var(--${rawAlpha.slice(1)})`;
  if (rawAlpha === '0') return '0';

  return `.${rawAlpha}`;
}

/** Apply an opacity suffix to a color, replacing any alpha it already carries. */
function fadeColor(color: string, rawAlpha: string): string {
  return overrideColorAlpha(color, alphaSuffixToAlpha(rawAlpha));
}

/**
 * Convert an opacity suffix to the percentage `color-mix()` needs, by shifting
 * the decimal point rather than multiplying: `.07` is `7%`, not the
 * `7.000000000000001%` that `parseFloat('.07') * 100` produces.
 */
function alphaSuffixToPercentage(rawAlpha: string): string {
  if (rawAlpha.startsWith('$')) {
    // A mix percentage cannot be a `<number>`, so the reference has to be scaled.
    return `calc(var(--${rawAlpha.slice(1)}) * 100%)`;
  }
  if (rawAlpha === '0') return '0%';

  const digits = rawAlpha.length === 1 ? `${rawAlpha}0` : rawAlpha;
  const whole = String(Number(digits.slice(0, 2)));
  const fraction = digits.slice(2);

  return `${fraction ? `${whole}.${fraction}` : whole}%`;
}

/**
 * Apply an opacity suffix to `currentcolor`, composing with any alpha an
 * ancestor already applied. See {@link mixColorAlpha} for why this differs from
 * how a token is faded.
 */
function fadeCurrentColor(rawAlpha: string): string {
  return mixColorAlpha('currentcolor', alphaSuffixToPercentage(rawAlpha));
}

/**
 * Whether parsed function arguments hold a color. Colors reach either the color
 * bucket (`#token`, a nested color function, `transparent`) or — for the CSS
 * named colors, which the parser has no token syntax for — the modifier bucket.
 */
function hasColorArgs(parsed: ProcessedStyle): boolean {
  const namedColors = getNamedColorHex();

  return parsed.groups.some(
    (group) =>
      group.colors.length > 0 || group.mods.some((mod) => namedColors.has(mod)),
  );
}

/**
 * Re-parses a value through the parser until it stabilizes (no changes)
 * or max iterations reached. This allows units to reference other units.
 * Example: { x: '8px', y: '2x' } -> '1y' resolves to '16px'
 */
function resolveUntilStable(
  value: string,
  opts: ParserOptions,
  recurse: (str: string) => ProcessedStyle,
  maxIterations = 10,
): string {
  let current = value;
  for (let i = 0; i < maxIterations; i++) {
    // Check if the current value contains a custom unit that needs resolution
    const unitMatch = current.match(RE_UNIT_NUM);
    if (!unitMatch) break; // Not a unit number, no resolution needed

    const unitName = unitMatch[1];
    // Only recurse if the unit is a custom unit we know about
    // Any unit not in opts.units is assumed to be a native CSS unit
    if (!opts.units || !(unitName in opts.units)) break;

    const result = recurse(current);
    if (result.output === current) break; // Stable
    current = result.output;
  }
  return current;
}

export function classify(
  raw: string,
  opts: ParserOptions,
  recurse: (str: string) => ProcessedStyle,
): { bucket: Bucket; processed: string } {
  const token = raw.trim();
  if (!token) return { bucket: Bucket.Mod, processed: '' };

  // Early-out: if the token contains unmatched parentheses treat it as invalid
  // and skip it. This avoids cases like `drop-shadow(` that are missing a
  // closing parenthesis (e.g., a user-typo in CSS). We count paren depth while
  // ignoring everything inside string literals to avoid false positives.
  {
    let depth = 0;
    let inQuote: string | 0 = 0;
    for (let i = 0; i < token.length; i++) {
      const ch = token[i];

      // track quote context so parentheses inside quotes are ignored
      if (inQuote) {
        if (ch === inQuote && token[i - 1] !== '\\') inQuote = 0;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch;
        continue;
      }

      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
    }

    if (depth !== 0) {
      // Unbalanced parens → treat as invalid token (skipped).
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Tasty] skipped invalid function token with unmatched parentheses:',
          token,
        );
      }
      return { bucket: Bucket.Mod, processed: '' };
    }
  }

  // Quoted string literals should be treated as value tokens (e.g., "" for content)
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return { bucket: Bucket.Value, processed: token };
  }

  // 0. Double prefix for literal CSS property names ($$name -> --name, ##name -> --name-color)
  // Used in transitions and animations to reference the property name itself, not its value.
  // Also supports custom @function invocation: $$name(args) -> --name(processed args).
  if (token.startsWith('$$')) {
    const rest = token.slice(2);
    const openIdx = rest.indexOf('(');
    if (openIdx > 0 && rest.endsWith(')')) {
      const fname = rest.slice(0, openIdx);
      if (/^[a-z_][a-z0-9-_]*$/i.test(fname)) {
        const inner = rest.slice(openIdx + 1, -1).trim();
        const cssName = `--${fname}`;
        // @function polyfill: when a compiled closure is registered for this
        // function, inline the call into plain CSS instead of emitting the
        // (limited-support) native `--name(...)` call.
        if (opts.functions && cssName in opts.functions) {
          const groups = inner
            ? new StyleParser(opts).process(inner).groups
            : [];
          const funcResult = opts.functions[cssName](groups);
          // Empty result signals a recursion-cycle bail: leave the call as-is.
          if (funcResult !== '') {
            return classify(
              funcResult,
              { ...opts, functions: undefined },
              recurse,
            );
          }
        }
        const args = inner ? recurse(inner).output : '';
        return { bucket: Bucket.Value, processed: `--${fname}(${args})` };
      }
    }
    if (/^[a-z_][a-z0-9-_]*$/i.test(rest)) {
      return { bucket: Bucket.Value, processed: `--${rest}` };
    }
  }
  if (token.startsWith('##')) {
    const rest = token.slice(2);
    const openIdx = rest.indexOf('(');
    if (openIdx > 0 && rest.endsWith(')')) {
      const fname = rest.slice(0, openIdx);
      if (/^[a-z_][a-z0-9-_]*$/i.test(fname)) {
        const inner = rest.slice(openIdx + 1, -1).trim();
        const args = inner ? recurse(inner).output : '';
        return { bucket: Bucket.Value, processed: `--${fname}-color(${args})` };
      }
    }
    if (/^[a-z_][a-z0-9-_]*$/i.test(rest)) {
      return { bucket: Bucket.Value, processed: `--${rest}-color` };
    }
  }

  // 0b. Special handling for #current (reserved keyword, cannot be overridden by
  // predefined tokens).
  //
  // `#current` is the `currentcolor` keyword, and emitting the keyword itself is
  // what makes it compose: it resolves against each element's own color, so a
  // `#current` under an ancestor that faded its color reads the *faded* color.
  // `var(--current-color)` cannot do that — the variable carries whatever the
  // nearest publishing ancestor put in it, and a faded color is deliberately not
  // published (see `colorStyle`), so a ramp built on `#current` would read
  // through to the unfaded color above it.
  if (token === '#current') {
    return { bucket: Bucket.Color, processed: 'currentcolor' };
  }

  // #current with opacity: #current.5 or #current.$opacity
  //
  // `color-mix()` rather than the relative color syntax a token fade uses.
  // Fading a token *names* a color, so it replaces the alpha; `currentcolor` is
  // the color an element inherits, which an ancestor may already have faded, so
  // `#current.4` means "40% of what reaches me" and composes — `#current.4` with
  // `#current.18` under it lands at `.072`. `color-mix()` with `currentcolor`
  // has worked since Safari 16.2.
  const currentAlphaMatch = token.match(
    /^#current\.(\$[a-z_][a-z0-9-_]*|[0-9]+)$/i,
  );
  if (currentAlphaMatch) {
    return {
      bucket: Bucket.Color,
      processed: fadeCurrentColor(currentAlphaMatch[1]),
    };
  }

  // 0c. Check for predefined tokens (configured via configure({ replaceTokens: {...} }))
  // Must happen before default $ and # handling to allow overriding
  if (token[0] === '$' || token[0] === '#') {
    const predefinedTokens = getGlobalPredefinedTokens();
    if (predefinedTokens) {
      // Exact match. Keys are stored lowercase, and token names are matched
      // case-insensitively even though the name they *emit* keeps its case.
      const lookupKey = token.toLowerCase();
      if (lookupKey in predefinedTokens) {
        const tokenValue = predefinedTokens[lookupKey];
        // Fold the token value the same way the parser folds its input.
        return classify(foldDslCase(tokenValue), opts, recurse);
      }
      // Check for color token with alpha suffix: #token.alpha or #token.$prop
      if (token[0] === '#') {
        const alphaMatch = token.match(
          /^(#[a-z0-9-]+)\.(\$[a-z_][a-z0-9-_]*|[0-9]+)$/i,
        );
        if (alphaMatch) {
          const [, baseToken, rawAlpha] = alphaMatch;
          const baseKey = baseToken.toLowerCase();
          if (baseKey in predefinedTokens) {
            const resolvedValue = predefinedTokens[baseKey];

            // If resolved value starts with # (color token), use standard alpha syntax
            if (resolvedValue.startsWith('#')) {
              // Fold to match parser behavior
              return classify(
                `${foldDslCase(resolvedValue)}.${rawAlpha}`,
                opts,
                recurse,
              );
            }

            // For color functions like rgb(), rgba(), hsl(), hwb(), etc., inject alpha.
            // This covers all standard CSS color functions plus any custom color
            // function registered as a parse function (e.g. okhsl/okhst via plugins),
            // so no function name is hardcoded here.
            const funcMatch = resolvedValue.match(RE_FUNC_CALL);
            if (funcMatch) {
              const [, funcName, args] = funcMatch;
              const lowerFunc = funcName.toLowerCase();

              // A derived color function (color-mix, light-dark, …) has no alpha
              // channel to write into, so opacity is applied to the whole call
              // the same way `#current.5` is.
              if (DERIVED_COLOR_FUNCS.has(lowerFunc)) {
                const resolved = classify(
                  foldDslCase(resolvedValue),
                  opts,
                  recurse,
                );

                return {
                  bucket: Bucket.Color,
                  processed: fadeColor(resolved.processed, rawAlpha),
                };
              }
              const isCustomFunc = !!(
                opts.functions &&
                lowerFunc in opts.functions &&
                !COLOR_FUNCS.has(lowerFunc) &&
                !COLOR_FUNCS.has(funcName.replace(/a$/i, '').toLowerCase())
              );
              // Native color function name with the legacy 'a' suffix dropped
              // (rgba->rgb, hsla->hsl). Custom functions keep their original name.
              const normalizedFunc = isCustomFunc
                ? lowerFunc
                : funcName.replace(/a$/i, '').toLowerCase();
              // Only treat as a color function if it is a native CSS color
              // function or a registered custom parse function. Otherwise the
              // resolved value is some other function call and alpha injection
              // does not apply.
              const isColorFunc =
                COLOR_FUNCS.has(normalizedFunc) ||
                COLOR_FUNCS.has(lowerFunc) ||
                isCustomFunc;
              if (!isColorFunc) {
                return classify(`${resolvedValue}.${rawAlpha}`, opts, recurse);
              }
              // Handle $prop syntax for custom property alpha
              let alpha: string;
              if (rawAlpha.startsWith('$')) {
                const propName = rawAlpha.slice(1);
                alpha = `var(--${propName})`;
              } else {
                alpha = rawAlpha === '0' ? '0' : `.${rawAlpha}`;
              }
              // Normalize to modern syntax: replace top-level commas with spaces
              // Preserves commas inside nested functions like min(), max(), clamp()
              const normalizeArgs = (a: string) => {
                let result = '';
                let depth = 0;
                for (let i = 0; i < a.length; i++) {
                  const c = a[i];
                  if (c === '(') {
                    depth++;
                    result += c;
                  } else if (c === ')') {
                    depth = Math.max(0, depth - 1);
                    result += c;
                  } else if (c === ',' && depth === 0) {
                    // Skip comma and any following whitespace at top level
                    while (i + 1 < a.length && /\s/.test(a[i + 1])) i++;
                    result += ' ';
                  } else {
                    result += c;
                  }
                }
                return result;
              };
              // Helper: find last top-level occurrence of a character (ignores parentheses)
              const findLastTopLevel = (str: string, ch: string) => {
                let depth = 0;
                for (let i = str.length - 1; i >= 0; i--) {
                  const c = str[i];
                  if (c === ')') depth++;
                  else if (c === '(') depth = Math.max(0, depth - 1);
                  else if (c === ch && depth === 0) return i;
                }
                return -1;
              };

              // Check if already has alpha:
              // - Modern syntax: has `/` separator at top level (works with dynamic alpha like var()/calc())
              // - Legacy syntax: function ends with 'a' (rgba, hsla) and has exactly 4 top-level comma-separated values
              const slashIdx = findLastTopLevel(args, '/');
              const hasModernAlpha = slashIdx !== -1;

              // Count top-level commas to avoid commas inside nested functions
              let topLevelCommaCount = 0;
              let lastTopLevelComma = -1;
              {
                let depth = 0;
                for (let i = 0; i < args.length; i++) {
                  const c = args[i];
                  if (c === '(') depth++;
                  else if (c === ')') depth = Math.max(0, depth - 1);
                  else if (c === ',' && depth === 0) {
                    topLevelCommaCount++;
                    lastTopLevelComma = i;
                  }
                }
              }

              const hasLegacyAlpha =
                !hasModernAlpha &&
                /a$/i.test(funcName) &&
                topLevelCommaCount === 3;

              const colorArgs =
                hasModernAlpha || hasLegacyAlpha
                  ? normalizeArgs(
                      hasModernAlpha
                        ? args.slice(0, slashIdx).trim()
                        : args.slice(0, lastTopLevelComma).trim(),
                    )
                  : normalizeArgs(args);

              const constructed = `${normalizedFunc}(${colorArgs} / ${alpha})`;

              // Custom functions (not native CSS) must be re-classified
              // so the function handler can convert them to valid CSS
              if (
                !COLOR_FUNCS.has(normalizedFunc) &&
                opts.functions &&
                normalizedFunc in opts.functions
              ) {
                return classify(constructed, opts, recurse);
              }

              return { bucket: Bucket.Color, processed: constructed };
            }

            // Fallback: try appending .alpha (may not work for all cases)
            return classify(`${resolvedValue}.${rawAlpha}`, opts, recurse);
          }
        }
      }
    }
  }

  // 0. Direct var(--*-color) token
  const varColorMatch = token.match(/^var\(--([a-zA-Z0-9-]+)-color\)$/);
  if (varColorMatch) {
    return { bucket: Bucket.Color, processed: token };
  }

  // 1. URL
  if (token.startsWith('url(')) {
    return { bucket: Bucket.Value, processed: token };
  }

  // 2. Custom property
  if (token[0] === '$') {
    const identMatch = token.match(/^\$([a-z_][a-zA-Z0-9-_]*)$/);
    if (identMatch) {
      const name = identMatch[1];
      const processed = `var(--${name})`;
      const bucketType = name.endsWith('-color')
        ? Bucket.ColorValue
        : Bucket.Value;
      return {
        bucket: bucketType,
        processed,
      };
    }
    // invalid custom property → modifier
  }

  // 3. Hash colors (with optional alpha suffix e.g., #purple.5 or #purple.$disabled)
  if (token[0] === '#' && token.length > 1) {
    // alpha form: #name.alpha or #name.$prop
    const alphaMatch = token.match(
      /^#([a-z0-9-]+)\.(\$[a-z_][a-z0-9-_]*|[0-9]+)$/i,
    );
    if (alphaMatch) {
      const [, base, rawAlpha] = alphaMatch;

      // Opacity applies to the color variable as a whole. The token may hold
      // anything a `<color>` can be — including a `color-mix()` or a
      // `light-dark()` with no channels to decompose, or a value written
      // straight into `--name-color` by hand-authored CSS that Tasty never
      // defined — and relative color syntax fades all of them.
      return {
        bucket: Bucket.Color,
        processed: fadeColor(`var(--${base}-color)`, rawAlpha),
      };
    }

    // hyphenated names like #dark-05 should keep full name

    const name = token.slice(1);
    // valid hex → treat as hex literal with fallback
    if (RE_HEX.test(name)) {
      return {
        bucket: Bucket.Color,
        processed: `var(--${name}-color, #${name})`,
      };
    }
    // simple color name token → css variable lookup with rgb fallback
    return { bucket: Bucket.Color, processed: `var(--${name}-color)` };
  }

  // 4 & 5. Functions
  const openIdx = token.indexOf('(');
  if (openIdx > 0 && token.endsWith(')')) {
    const fname = token.slice(0, openIdx);
    const inner = token.slice(openIdx + 1, -1); // without ()

    if (COLOR_FUNCS.has(fname)) {
      // Process inner to expand nested colors or units.
      const parsedInner = recurse(inner);
      const argProcessed = parsedInner.output.replace(/,\s+/g, ','); // color funcs expect no spaces after commas
      const processed = `${canonicalFuncName(fname)}(${argProcessed})`;
      // `light-dark()` is not color-only — CSS lets it pick between values of
      // any type — so bucket it by what it actually holds. Otherwise
      // `padding: 'light-dark(1x, 2x)'` would land in the color slot and the
      // padding handler would emit its default instead.
      const bucket =
        fname === POLYMORPHIC_COLOR_FUNC && !hasColorArgs(parsedInner)
          ? Bucket.Value
          : Bucket.Color;

      return { bucket, processed };
    }

    // user function (provided via opts)
    if (opts.functions && fname in opts.functions) {
      // split by top-level commas within inner
      const tmp = new StyleParser(opts).process(inner); // fresh parser w/ same opts but no cache share issues
      const funcResult = opts.functions[fname](tmp.groups);
      // Re-classify the result to determine proper bucket (e.g., if it returns a color)
      // Pass functions: undefined to prevent infinite recursion if result matches a function pattern
      return classify(funcResult, { ...opts, functions: undefined }, recurse);
    }

    // generic: process inner and rebuild
    const argProcessed = recurse(inner).output;
    return {
      bucket: Bucket.Value,
      processed: `${canonicalFuncName(fname)}(${argProcessed})`,
    };
  }

  // 6. Color fallback syntax: (#name, fallback)
  if (token.startsWith('(') && token.endsWith(')')) {
    const inner = token.slice(1, -1);
    const colorMatch = inner.match(/^#([a-z0-9-]+)\s*,\s*(.*)$/i);
    if (colorMatch) {
      const [, name, fallback] = colorMatch;
      const processedFallback = recurse(fallback).output;
      return {
        bucket: Bucket.Color,
        processed: `var(--${name}-color, ${processedFallback})`,
      };
    }
  }

  // 7. Custom property with fallback syntax: ($prop, fallback)
  if (token.startsWith('(') && token.endsWith(')')) {
    const inner = token.slice(1, -1);
    const match = inner.match(/^\$([a-z_][a-zA-Z0-9-_]*)\s*,\s*(.*)$/);
    if (match) {
      const [, name, fallback] = match;
      const processedFallback = recurse(fallback).output;
      const bucketType = name.endsWith('-color')
        ? Bucket.ColorValue
        : Bucket.Value;
      return {
        bucket: bucketType,
        processed: `var(--${name}, ${processedFallback})`,
      };
    }
  }

  // 8. Auto-calc group
  if (token[0] === '(' && token[token.length - 1] === ')') {
    const inner = token.slice(1, -1);
    const innerProcessed = recurse(inner).output;
    return { bucket: Bucket.Value, processed: `calc(${innerProcessed})` };
  }

  // 9. Unit number
  const um = token.match(RE_UNIT_NUM);
  if (um) {
    const unit = um[1];
    const numericPart = parseFloat(token.slice(0, -unit.length));
    const handler = opts.units && opts.units[unit];
    if (handler) {
      if (typeof handler === 'string') {
        // Check if this is a raw CSS unit (e.g., "8px", "1rem")
        const rawMatch = handler.match(RE_RAW_UNIT);
        if (rawMatch) {
          // Raw unit: calculate directly instead of using calc()
          const [, baseNum, cssUnit] = rawMatch;
          const result = numericPart * parseFloat(baseNum);
          const processed = `${result}${cssUnit}`;
          // Re-parse to resolve any nested units (e.g., units referencing other units)
          const resolved = resolveUntilStable(processed, opts, recurse);
          return { bucket: Bucket.Value, processed: resolved };
        }

        // Non-raw handler (e.g., "var(--gap)", "calc(...)"): use calc() wrapping
        const base = handler;
        if (numericPart === 1) {
          return { bucket: Bucket.Value, processed: base };
        }
        return {
          bucket: Bucket.Value,
          processed: `calc(${numericPart} * ${base})`,
        };
      } else {
        // Function units return complete CSS expressions, no wrapping needed
        const inner = handler(numericPart);
        return {
          bucket: Bucket.Value,
          processed: inner,
        };
      }
    }
  }

  // 9b. Unknown numeric+unit → treat as literal value (e.g., 1fr)
  if (/^[+-]?(?:\d*\.\d+|\d+)[a-z%]+$/.test(token)) {
    return { bucket: Bucket.Value, processed: token };
  }

  // 9c. Plain unit-less numbers should be treated as value tokens (e.g.,
  // numeric arguments in custom style handlers).
  if (RE_NUMBER.test(token)) {
    return { bucket: Bucket.Value, processed: token };
  }

  // 10. Literal value keywords
  if (VALUE_KEYWORDS.has(token)) {
    return { bucket: Bucket.Value, processed: token };
  }

  // 10b. Special keyword colors
  if (token === 'transparent' || token === 'currentcolor') {
    return { bucket: Bucket.Color, processed: token };
  }

  // 11. Fallback modifier
  return { bucket: Bucket.Mod, processed: token };
}
