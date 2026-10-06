/**
 * Shared utility for transforming capitalized PascalCase element names
 * in CSS selector content to `[data-element="..."]` attribute selectors.
 *
 * Lowercase words are treated as HTML tags and left unchanged.
 */

/**
 * Matches a capitalized PascalCase word at the start of the string
 * or after a CSS combinator/separator character.
 */
const ELEMENT_NAME_RE = /(^|[\s>+~,(])([A-Z][a-zA-Z0-9]*)/g;

/**
 * Replace capitalized PascalCase words with `[data-element="Name"]` selectors.
 *
 * @example
 * transformSelectorContent('> Field + input:checked')
 * // → '> [data-element="Field"] + input:checked'
 *
 * transformSelectorContent('Body > Row')
 * // → '[data-element="Body"] > [data-element="Row"]'
 *
 * transformSelectorContent('button')
 * // → 'button'  (lowercase = HTML tag, unchanged)
 */
export function transformSelectorContent(content: string): string {
  return content.replace(
    ELEMENT_NAME_RE,
    (_, prefix, name) => `${prefix}[data-element="${name}"]`,
  );
}

/** Split a CSS selector list at commas outside strings, brackets, and functions. */
export function splitSelectorsSafely(selectorList: string): string[] {
  if (!selectorList.includes(',')) {
    const selector = selectorList.trim();
    return selector ? [selector] : [];
  }

  const parts: string[] = [];
  let start = 0;
  let squareDepth = 0;
  let parenDepth = 0;
  let quote = '';

  for (let i = 0; i < selectorList.length; i++) {
    const char = selectorList[i];

    // Escapes protect commas and quotes; skipping pairs also handles an even
    // number of backslashes before a closing quote correctly.
    if (char === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '/' && selectorList[i + 1] === '*') {
      const end = selectorList.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    if (char === '[') squareDepth++;
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (char === '(') parenDepth++;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (char === ',' && squareDepth === 0 && parenDepth === 0) {
      const part = selectorList.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }

  const tail = selectorList.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}
