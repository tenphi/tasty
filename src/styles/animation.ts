import type { CSSMap, StyleValueStateMap } from '../utils/styles';

import { createStyle } from './createStyle';

/**
 * Every keyword an `animation` shorthand item can hold besides its name: the
 * values of the other longhands, plus the CSS-wide keywords.
 */
const NON_NAME_KEYWORDS = new Set(
  'none initial inherit unset revert revert-layer auto normal running paused reverse alternate alternate-reverse forwards backwards both infinite ease linear ease-in ease-out ease-in-out step-start step-end'.split(
    ' ',
  ),
);

/** An identifier that can name keyframes — not a number, string or function. */
const RE_NAME = /^(?:--|-?[a-zA-Z_\u0080-￿])[\w\-\u0080-￿]*$/;

export interface AnimationName {
  name: string;
  /** Where the name starts in the scanned value. */
  index: number;
}

function nameAt(value: string, start: number, end: number) {
  const token = value.slice(start, end);

  return RE_NAME.test(token) && !NON_NAME_KEYWORDS.has(token.toLowerCase())
    ? { name: token, index: start }
    : null;
}

/**
 * The name in each item of an `animation` / `animation-name` list, or `null`
 * for an item without one.
 *
 * Items split at top-level commas only, and a function is one token: the comma
 * and the `end` in `steps(4, end)` belong to the timing function, not to a new
 * item or a name.
 */
export function scanAnimationNames(value: string): (AnimationName | null)[] {
  const items: (AnimationName | null)[] = [];
  let found: AnimationName | null = null;
  let start = -1;
  let depth = 0;
  let quote = '';

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }

    if (depth === 0 && (ch === ',' || /\s/.test(ch))) {
      if (start !== -1) found ??= nameAt(value, start, i);
      start = -1;

      if (ch === ',') {
        items.push(found);
        found = null;
      }
      continue;
    }

    if (start === -1) start = i;

    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '\\') i++;
    else if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
  }

  if (start !== -1) found ??= nameAt(value, start, value.length);
  items.push(found);

  return items;
}

/**
 * Give each animation name in `output` the case it was authored with.
 *
 * The DSL parser folds what it reads to lowercase, but keyframes names are
 * case-sensitive: `fadeIn` has to reach the stylesheet as `fadeIn` to match
 * `@keyframes fadeIn`, and the local keyframes renaming looks it up under its
 * authored name. The parser emits a name as it read it, apart from the case,
 * so each item's name is put back where the parser left it.
 */
export function restoreAnimationNameCase(
  authored: string,
  output: string,
): string {
  if (authored === output || authored === authored.toLowerCase()) {
    return output;
  }

  const authoredNames = scanAnimationNames(authored);
  const outputNames = scanAnimationNames(output);

  if (authoredNames.length !== outputNames.length) return output;

  let result = output;

  // From the end, so the indexes of earlier items stay valid.
  for (let i = outputNames.length - 1; i >= 0; i--) {
    const from = outputNames[i];
    const to = authoredNames[i];

    if (!from || !to || from.name === to.name) continue;
    if (from.name !== to.name.toLowerCase()) continue;

    result =
      result.slice(0, from.index) +
      to.name +
      result.slice(from.index + from.name.length);
  }

  return result;
}

function animationNameHandler(
  styleName: 'animation' | 'animationName',
  property: 'animation' | 'animation-name',
) {
  const base = createStyle(styleName);

  const handler = (styleMap: StyleValueStateMap): CSSMap | null => {
    // A plain property handler: one map, or nothing to emit.
    const result = base(styleMap) as CSSMap | null;
    const value = styleMap[styleName];

    if (!result || typeof value !== 'string') return result;

    return {
      [property]: restoreAnimationNameCase(value, String(result[property])),
    };
  };

  handler.__lookupStyles = [styleName];

  return handler;
}

export const animationStyle = animationNameHandler('animation', 'animation');
export const animationNameStyle = animationNameHandler(
  'animationName',
  'animation-name',
);
