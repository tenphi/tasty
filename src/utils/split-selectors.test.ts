import {
  pseudoElementIndex,
  rootStateIndex,
  splitSelectorsSafely,
} from './selector-transform';

describe('splitSelectorsSafely', () => {
  it.each([
    [':is(.a, :not(.b, .c)), .d', [':is(.a, :not(.b, .c))', '.d']],
    ['[data-value="a,b"], .c', ['[data-value="a,b"]', '.c']],
    [String.raw`.a\,b, .c`, [String.raw`.a\,b`, '.c']],
    [
      String.raw`[data-value="a\\"], .c`,
      [String.raw`[data-value="a\\"]`, '.c'],
    ],
    ['.a/* , ) ] */ > .b, .c', ['.a/* , ) ] */ > .b', '.c']],
  ] as const)('preserves commas inside %s', (input, expected) => {
    expect(splitSelectorsSafely(input)).toEqual(expected);
  });
});

describe('rootStateIndex', () => {
  it.each([
    [':root', 5],
    [':ROOT', 5],
    ['html', 4],
    ['HTML', 4],
    ['html.dark', 9],
    ['*:root', 6],
    [':root[data-theme]', 17],
    ['html:not(.x, .y)', 16],
    ['html::before', 4],
    ['html:before', 4],
    [':root:is(.a)::selection', 12],
    ['[data-x=":root"]:root', 21],
    ['html[lang|="en"]', 16],
    [':where(:root)', 13],
    [':is(:root)', 10],
    [':is(html, :root.dark)', 21],
    [':where(:root)::before', 13],
  ] as const)('attaches root states to %s at %i', (selector, index) => {
    expect(rootStateIndex(selector)).toBe(index);
  });

  it.each([
    'body',
    '.card',
    'html-element',
    ':root-ish',
    ':not(:root)',
    '[data-x=":root"]',
    ':root .card',
    'html > body',
    ':root + .x',
    'html, body',
    'html/* c */',
    'html|div',
    'html|*',
    String.raw`html\.x`,
    'htmlé',
    ':is(:root, .x)',
    ':where(:root .x)',
    ':where()',
  ])('treats %s as a selector the root is not the subject of', (selector) => {
    expect(rootStateIndex(selector)).toBe(-1);
  });
});

describe('pseudoElementIndex', () => {
  it.each([
    ['a::before', 1],
    ['dialog::backdrop', 6],
    ['::after', 0],
    [' [data-element="X"]::marker', 19],
    ['summary::-webkit-details-marker', 7],
    ['input::placeholder', 5],
    // Functional pseudo-elements.
    ['::part(label)', 0],
    ['x-el::part(a b)', 4],
    ['::slotted(span.x)', 0],
    ['p::highlight(found)', 1],
    // Legacy single-colon pseudo-elements, in any case.
    ['a:before', 1],
    ['a:AFTER', 1],
    ['p:first-line', 1],
    ['p:first-letter', 1],
    // Pseudo-classes before the pseudo-element stay with the originating
    // element; those after it qualify the pseudo-element and stay after it.
    ['li:first-child::marker', 14],
    ['li:first-child:before', 14],
    ['::part(label):hover', 0],
    ['div::-webkit-scrollbar-thumb:hover', 3],
    ['li::after::marker', 2],
    // Only the last compound counts.
    ['a::before > b::after', 13],
    ['a::before ~ b', 13],
    ['::before span', 13],
    ['a::before ', 1],
    // Lookalikes inside brackets, functions, strings, and escapes.
    ['a[title="x::y"]', 15],
    ['a:not(::before)', 15],
    ['a:is(:before)', 13],
    [String.raw`a\:\:before`, 11],
    ['a/* ::before */', 15],
    // Pseudo-classes whose names start like a legacy pseudo-element.
    ['a:before-x', 10],
    ['a:after-x', 9],
    ['a:hover', 7],
    ['', 0],
  ] as const)('finds the pseudo-element of %j at %i', (selector, index) => {
    expect(pseudoElementIndex(selector)).toBe(index);
  });
});
