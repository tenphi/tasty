import { splitSelectorsSafely } from './selector-transform';

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
