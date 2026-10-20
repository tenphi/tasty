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

/** The `html` type selector at the start of a compound. */
const HTML_TYPE_RE = /^html(?![\w\-|\\\u0080-\uffff])/i;

/** Legacy single-colon pseudo-elements, which end a compound like `::x`. */
const LEGACY_PSEUDO_ELEMENT_RE = /^:(?:before|after|first-line|first-letter)$/i;

/**
 * Where a state segment for the root element goes in `selector`, when
 * `selector` is a single compound that can only match the root: one carrying
 * a top-level `:root`, the `html` type selector, or an `:is()` / `:where()`
 * whose every argument is such a compound. The index is before any
 * pseudo-element, so `html::before` takes states as `html:where(…)::before`.
 *
 * Returns -1 for anything else — a compound that may match other elements, or
 * a complex selector, whose root is an ancestor rather than the subject.
 *
 * @example
 * rootStateIndex(':root')          // → 5
 * rootStateIndex('html.dark')      // → 9
 * rootStateIndex(':where(:root)')  // → 13
 * rootStateIndex('html::before')   // → 4
 * rootStateIndex('body')           // → -1
 * rootStateIndex(':root .card')    // → -1
 */
export function rootStateIndex(selector: string): number {
  // `html|x` is a namespaced type and `html\.x` an escaped name, not `html`.
  let isRoot = HTML_TYPE_RE.test(selector);
  let pseudoElementAt = -1;
  let squareDepth = 0;
  let parenDepth = 0;
  let quote = '';
  // Where a top-level `:is(` / `:where(` opens, and where its arguments start.
  let rootFunctionParen = -1;
  let rootFunctionArgs = -1;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

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

    if (char === '[') squareDepth++;
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (char === '(') {
      if (i === rootFunctionParen && parenDepth === 0) rootFunctionArgs = i + 1;
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      if (parenDepth === 0 && rootFunctionArgs !== -1) {
        // `:where(:root)` matches only the root when every argument does.
        const args = splitSelectorsSafely(selector.slice(rootFunctionArgs, i));
        if (
          args.length > 0 &&
          args.every((arg) => rootStateIndex(arg) === arg.length)
        ) {
          isRoot = true;
        }
        rootFunctionArgs = -1;
      }
    }

    if (squareDepth > 0 || parenDepth > 0) continue;

    // A combinator (or a comment, which may hide one) makes the root an
    // ancestor of the subject, not the subject.
    if (/[\s>+~,]/.test(char) || (char === '/' && selector[i + 1] === '*')) {
      return -1;
    }

    if (char !== ':' || pseudoElementAt !== -1) continue;

    if (selector[i + 1] === ':') {
      pseudoElementAt = i;
      continue;
    }

    const name = (/^:[\w-]+/.exec(selector.slice(i))?.[0] ?? '').toLowerCase();
    if (name === ':root') isRoot = true;
    else if (LEGACY_PSEUDO_ELEMENT_RE.test(name)) pseudoElementAt = i;
    else if (
      (name === ':is' || name === ':where') &&
      selector[i + name.length] === '('
    ) {
      rootFunctionParen = i + name.length;
    }
  }

  if (!isRoot) return -1;
  return pseudoElementAt === -1 ? selector.length : pseudoElementAt;
}

/**
 * Where the pseudo-element that ends `selector` begins: the first top-level
 * `::name` (or legacy `:before`, `:after`, `:first-line`, `:first-letter`) in
 * its last compound. Returns `selector.length` when that compound has none.
 *
 * A state for the element `selector` targets goes at this index. A
 * pseudo-element takes no `:where()` after it, so the state attaches to the
 * originating element instead: `a::before` takes `[rel]` as
 * `a:where([rel])::before`. Everything from the pseudo-element on stays after
 * the state, including pseudo-classes that qualify the pseudo-element itself
 * (`::part(x):hover`, `::-webkit-scrollbar-thumb:hover`) and a chained
 * pseudo-element (`::after::marker`).
 *
 * Expects one complex selector; split a list with `splitSelectorsSafely`.
 *
 * @example
 * pseudoElementIndex('a::before')                  // → 1
 * pseudoElementIndex('dialog::backdrop')           // → 6
 * pseudoElementIndex('::part(x):hover')            // → 0
 * pseudoElementIndex('li:first-child:before')      // → 14
 * pseudoElementIndex('a:hover')                    // → 7
 * pseudoElementIndex('::before > span')            // → 15
 */
export function pseudoElementIndex(selector: string): number {
  let pseudoElementAt = -1;
  // Set after a combinator; the next compound clears what came before it.
  let newCompound = false;
  let squareDepth = 0;
  let parenDepth = 0;
  let quote = '';

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];

    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && selector[i + 1] === '*') {
      const end = selector.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    if (squareDepth === 0 && parenDepth === 0) {
      // Whitespace counts only once another compound follows it, so
      // trailing whitespace keeps the last compound's pseudo-element.
      if (/[\s>+~,]/.test(char)) {
        newCompound = true;
        continue;
      }
      if (newCompound) {
        pseudoElementAt = -1;
        newCompound = false;
      }
      if (pseudoElementAt === -1 && char === ':') {
        const name = /^:[\w-]+/.exec(selector.slice(i))?.[0] ?? '';
        if (selector[i + 1] === ':' || LEGACY_PSEUDO_ELEMENT_RE.test(name)) {
          pseudoElementAt = i;
        }
      }
    }

    if (char === '\\') i++;
    else if (char === '"' || char === "'") quote = char;
    else if (char === '[') squareDepth++;
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (char === '(') parenDepth++;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
  }

  return pseudoElementAt === -1 ? selector.length : pseudoElementAt;
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
