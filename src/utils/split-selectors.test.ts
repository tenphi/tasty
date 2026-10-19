import { rootStateIndex, splitSelectorsSafely } from './selector-transform';

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
