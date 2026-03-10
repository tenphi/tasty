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

export { ELEMENT_NAME_RE };

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
