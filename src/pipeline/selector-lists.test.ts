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

describe('selector lists in direct selector mode', () => {
  const selectorsOf = (
    styles: Parameters<typeof renderStyles>[0],
    selector: string,
  ) => renderStyles(styles, selector).map((rule) => rule.selector);

  it('applies states to every item of the list', () => {
    const rules = renderStyles(
      { fill: { '': '#white', selected: '#blue' } },
      '.card, .panel',
    );

    expect(rules.map((rule) => rule.selector)).toEqual([
      '.card:where(:not([data-selected])), .panel:where(:not([data-selected]))',
      '.card:where([data-selected]), .panel:where([data-selected])',
    ]);
  });

  it('applies sub-elements to every item of the list', () => {
    expect(selectorsOf({ Icon: { color: '#red' } }, '.card, .panel')).toEqual([
      '.card [data-element="Icon"], .panel [data-element="Icon"]',
    ]);
  });

  it('keeps commas nested in an item', () => {
    expect(
      selectorsOf(
        { color: { '': '#red', hovered: '#blue' } },
        ':is(.a, .b) > .c, [data-x="1,2"]',
      ),
    ).toEqual([
      ':is(.a, .b) > .c:where(:not([data-hovered])), [data-x="1,2"]:where(:not([data-hovered]))',
      ':is(.a, .b) > .c:where([data-hovered]), [data-x="1,2"]:where([data-hovered])',
    ]);
  });

  it('prefixes every item with an ancestor root state', () => {
    expect(
      selectorsOf(
        { color: { '': '#red', '@root(theme=dark)': '#blue' } },
        'a, b',
      ),
    ).toEqual([
      ':where(:root:not([data-theme="dark"])) a, :where(:root:not([data-theme="dark"])) b',
      ':where(:root[data-theme="dark"]) a, :where(:root[data-theme="dark"]) b',
    ]);
  });

  it('doubles a leading class on every item when asked', () => {
    expect(
      renderStyles({ order: 1 }, '.card, .panel', { doubleSelector: true }).map(
        (rule) => rule.selector,
      ),
    ).toEqual(['.card.card, .panel.panel']);
  });
});

describe('root states on a root selector', () => {
  const styles = { $accent: { '': '#06f', '@root(scheme=dark)': '#49f' } };

  it.each([
    [':root', ':root'],
    ['html', 'html'],
    ['html.app', 'html.app'],
  ])('joins the states to %s instead of nesting it', (selector, base) => {
    expect(renderStyles(styles, selector).map((rule) => rule.selector)).toEqual(
      [
        `${base}:where(:not([data-scheme="dark"]))`,
        `${base}:where([data-scheme="dark"])`,
      ],
    );
  });

  it('joins the states to a zero-specificity root', () => {
    expect(
      renderStyles(styles, ':where(:root)').map((rule) => rule.selector),
    ).toEqual([
      ':where(:root):where(:not([data-scheme="dark"]))',
      ':where(:root):where([data-scheme="dark"])',
    ]);
  });

  it('doubles a leading class on joined and prefixed rules alike', () => {
    expect(
      renderStyles(
        {
          color: {
            '': '#red',
            '@root(scheme=dark)': '#blue',
            hovered: '#green',
          },
        },
        '.app:root',
        { doubleSelector: true },
      ).map((rule) => rule.selector),
    ).toEqual([
      '.app.app:root:where(:not([data-scheme="dark"])):where(:not([data-hovered]))',
      '.app.app:root:where([data-scheme="dark"]):where(:not([data-hovered]))',
      '.app.app:root:where([data-hovered])',
    ]);
  });

  it('places the states before a pseudo-element', () => {
    expect(
      renderStyles(
        { color: { '': '#red', '@root(scheme=dark)': '#blue' } },
        'html::selection',
      ).map((rule) => rule.selector),
    ).toEqual([
      'html:where(:not([data-scheme="dark"]))::selection',
      'html:where([data-scheme="dark"])::selection',
    ]);
  });

  it('keeps sub-element and own states after the joined root states', () => {
    expect(
      renderStyles(
        {
          color: { '': '#red', '@root(scheme=dark) & hovered': '#blue' },
          Icon: { color: { '': '#red', '@root(scheme=dark)': '#blue' } },
        },
        ':root',
      ).map((rule) => rule.selector),
    ).toEqual(
      expect.arrayContaining([
        ':root:where([data-scheme="dark"]):where([data-hovered])',
        ':root:where([data-scheme="dark"]) [data-element="Icon"]',
      ]),
    );
  });

  it('joins root items and prefixes the others in one list', () => {
    expect(
      renderStyles(styles, ':root, .scope').map((rule) => rule.selector),
    ).toEqual([
      ':root:where(:not([data-scheme="dark"])), :where(:root:not([data-scheme="dark"])) .scope',
      ':root:where([data-scheme="dark"]), :where(:root[data-scheme="dark"]) .scope',
    ]);
  });

  it('still prefixes a selector the root is only an ancestor of', () => {
    expect(renderStyles(styles, 'body').map((rule) => rule.selector)).toEqual([
      ':where(:root:not([data-scheme="dark"])) body',
      ':where(:root[data-scheme="dark"]) body',
    ]);
  });

  it('keeps the root prefix for class-mode rules', () => {
    const { rules } = renderStyles(styles);

    expect(rules.map((rule) => rule.rootPrefix)).toEqual([
      ':where(:root:not([data-scheme="dark"]))',
      ':where(:root[data-scheme="dark"])',
    ]);
  });
});
