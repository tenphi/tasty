import { renderStyles } from './index';

describe('nested selector lists', () => {
  it.each([
    ['& > A, & > B', ['.root > A', '.root > B']],
    ['& > a, /* comma, in comment */ & > b', ['.root > a', '.root > b']],
    ['&:hover, &:focus', ['.root:hover', '.root:focus']],
    ['.first, .second', ['.root .first', '.root .second']],
    ['& > a, .second', ['.root > a', '.root .second']],
    [
      '&:is(.first, .second), & > b',
      ['.root:is(.first, .second)', '.root > b'],
    ],
    ['&[data-value="a,b"], & > b', ['.root[data-value="a,b"]', '.root > b']],
    ['& > .first\\,second, & > b', ['.root > .first\\,second', '.root > b']],
  ] as const)('scopes every part of %s', (key, expected) => {
    const rules = renderStyles({ [key]: { order: 7 } }, '.root');

    expect(rules.map((rule) => rule.selector)).toEqual(expected);
    expect(rules.every((rule) => rule.declarations.includes('order: 7;'))).toBe(
      true,
    );
  });

  it('expands nested lists within every parent selector', () => {
    const rules = renderStyles(
      { '.first, .second': { '& > a, & > b': { order: 7 } } },
      '.root',
    );

    expect(rules.map((rule) => rule.selector)).toEqual([
      '.root .first > a',
      '.root .first > b',
      '.root .second > a',
      '.root .second > b',
    ]);
  });
});
