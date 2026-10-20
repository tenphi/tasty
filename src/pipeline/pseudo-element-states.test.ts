/**
 * States on a pseudo-element target (tenphi/tasty#406).
 *
 * When `$` ends in a pseudo-element, `@own()` means the pseudo-element's own
 * state and goes after it. So do the root states of a selector-mode base that
 * ends in a pseudo-element, whose `@parent()` context goes on the originating
 * element, before the pseudo-element. A state that tests what a
 * pseudo-element has none of (attributes, modifiers, classes, a position in
 * the tree) is dropped with a warning: it could never match, and its negation
 * hid the default. The browser half, `pseudo-element-states.test.tsx`, checks
 * what Chromium applies.
 */
import { computeStyles } from '../compute-styles';
import { useGlobalStyles } from '../hooks/useGlobalStyles';
import { createServerStyleCollector, runWithCollector } from '../ssr';
import type { Styles } from '../styles/types';
import { extractStylesForSelector, extractStylesWithChunks } from '../zero';

import { clearPipelineCache, renderStyles } from './index';
import { setWarningHandler } from './warnings';

let warnings: string[];
let restoreWarnings: () => void;

beforeEach(() => {
  clearPipelineCache();
  warnings = [];
  restoreWarnings = setWarningHandler((warning) => {
    warnings.push(warning.code);
  });
});

afterEach(() => restoreWarnings());

function selectors(styles: Styles, base = '.root'): string[] {
  return renderStyles(styles, base).map((rule) => rule.selector);
}

describe('@own() on a sub-element whose $ ends in a pseudo-element', () => {
  it.each([
    ['a::before', ' a::before'],
    ['@::marker', ' [data-element="Target"]::marker'],
    ['dialog::backdrop', ' dialog::backdrop'],
    ['input::placeholder', ' input::placeholder'],
    ['summary::-webkit-details-marker', ' summary::-webkit-details-marker'],
    ['>@::part(label)', ' > [data-element="Target"]::part(label)'],
    [
      '@::-webkit-scrollbar-thumb',
      ' [data-element="Target"]::-webkit-scrollbar-thumb',
    ],
    ['@::highlight(found)', ' [data-element="Target"]::highlight(found)'],
    ['a:before', ' a:before'],
    ['p:first-letter', ' p:first-letter'],
    ['li:first-child::marker', ' li:first-child::marker'],
    ['@::part(label):hover', ' [data-element="Target"]::part(label):hover'],
  ])('puts a pseudo-class state of %s after the pseudo-element', ($, el) => {
    expect(
      selectors({
        Target: { $, color: { '': 'red', '@own(:focus)': 'blue' } },
      }),
    ).toEqual([`.root${el}:where(:not(:focus))`, `.root${el}:where(:focus)`]);
    expect(warnings).toEqual([]);
  });

  it.each([
    '@own([rel="next"])',
    '!@own([open])',
    '@own(hovered)',
    '@own(theme=dark)',
    '@own(.active)',
    '@own(:first-child)',
    '@own(:nth-child(2n))',
    '@own(:has(img))',
    '@own(:not([open]))',
    '@own(:hover | [open])',
    '@own(:hover) & @own([open])',
    ':focus & @own([open])',
  ])('drops %s with a warning', (state) => {
    const rules = renderStyles(
      { Target: { $: 'a::before', content: { '': '"off"', [state]: '"on"' } } },
      '.root',
    );
    expect(rules).toEqual([
      { selector: '.root a::before', declarations: 'content: "off";' },
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });

  it('keeps the other states of a map when it drops one', () => {
    expect(
      selectors({
        Target: {
          $: 'a::before',
          color: {
            '': 'red',
            ':focus': 'green',
            '@own([open])': 'black',
            '@own(:hover)': 'blue',
          },
        },
      }),
    ).toEqual([
      '.root:where(:not(:focus)) a::before:where(:not(:hover))',
      '.root:where(:focus) a::before:where(:not(:hover))',
      '.root a::before:where(:hover)',
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });

  it('keeps root and @parent states, which describe other elements', () => {
    expect(
      selectors({
        Target: {
          $: 'a::before',
          color: { '': 'red', selected: 'blue', '@parent([open])': 'green' },
        },
      }),
    ).toEqual([
      '.root:where(:not([data-selected])):where(:not([open] *)) a::before',
      '.root:where([data-selected]):where(:not([open] *)) a::before',
      '.root:where([open] *) a::before',
    ]);
    expect(warnings).toEqual([]);
  });

  it.each([
    ['>@', ' > [data-element="Target"]'],
    ['a.link', ' a.link'],
    ['a[title="x::y"]', ' a[title="x::y"]'],
    ['::before span', ' ::before span'],
  ])('keeps attribute states on %s, which ends in an element', ($, el) => {
    expect(
      selectors({
        Target: { $, color: { '': 'red', '@own([open])': 'blue' } },
      }),
    ).toEqual([`.root${el}:where(:not([open]))`, `.root${el}:where([open])`]);
    expect(warnings).toEqual([]);
  });

  it('treats each item of a $ list on its own', () => {
    expect(
      selectors({
        Target: {
          $: 'summary::marker, summary',
          color: { '': 'red', '@own([open])': 'blue' },
        },
      }),
    ).toEqual([
      '.root summary::marker',
      '.root summary:where(:not([open]))',
      '.root summary:where([open])',
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });

  it('applies to an & key that ends in a pseudo-element', () => {
    expect(
      selectors({
        '&::before': {
          color: { '': 'red', '@own(:hover)': 'blue', '@own([open])': 'green' },
        },
      }),
    ).toEqual([
      '.root::before:where(:not(:hover))',
      '.root::before:where(:hover)',
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });

  it('builds the same fragments in component mode', () => {
    const { rules } = renderStyles({
      Icon: {
        $: 'a::before',
        content: { '': 'none', '@own(:hover)': '""', '@own([rel])': '"x"' },
      },
    });
    expect(rules.map((rule) => rule.selector)).toEqual([
      ' a::before:where(:not(:hover))',
      ' a::before:where(:hover)',
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });
});

describe('a direct selector that ends in a pseudo-element', () => {
  it('puts @parent before the pseudo-element and own states after it', () => {
    expect(
      selectors(
        { color: { '': 'red', ':hover': 'blue', '@parent(.dark)': 'green' } },
        '.card::before',
      ),
    ).toEqual([
      '.card:where(:not(.dark *))::before:where(:not(:hover))',
      '.card:where(:not(.dark *))::before:where(:hover)',
      '.card:where(.dark *)::before',
    ]);
    expect(warnings).toEqual([]);
  });

  it('drops attribute and modifier states with a warning', () => {
    expect(
      selectors(
        { color: { '': 'red', '[data-on]': 'blue', selected: 'green' } },
        '.card::before',
      ),
    ).toEqual(['.card::before']);
    expect(warnings).toEqual([
      'PSEUDO_ELEMENT_STATE_IGNORED',
      'PSEUDO_ELEMENT_STATE_IGNORED',
    ]);
  });

  it('joins @root states to a root selector before the pseudo-element', () => {
    expect(
      selectors(
        { color: { '': 'red', ':hover': 'blue', '@root(.dark)': 'green' } },
        'html::before',
      ),
    ).toEqual([
      'html:where(:not(.dark))::before:where(:not(:hover))',
      'html:where(:not(.dark))::before:where(:hover)',
      'html:where(.dark)::before',
    ]);
  });

  it('keeps a pseudo-class written after the pseudo-element with it', () => {
    expect(
      selectors(
        { '&:hover': { color: { '': 'red', ':focus': 'blue' } } },
        '.host::part(x)',
      ),
    ).toEqual([
      '.host::part(x):where(:not(:focus)):hover',
      '.host::part(x):where(:focus):hover',
    ]);
  });

  it('renders the items of a selector list by what they end in', () => {
    expect(
      selectors(
        { color: { '': 'red', '[data-on]': 'blue' } },
        '.a::before, .b, .c:after',
      ),
    ).toEqual([
      '.b:where(:not([data-on]))',
      '.b:where([data-on])',
      '.a::before, .c:after',
    ]);
    expect(warnings).toEqual(['PSEUDO_ELEMENT_STATE_IGNORED']);
  });

  it('leaves a stateless rule unchanged', () => {
    expect(selectors({ color: 'red' }, '.card::before')).toEqual([
      '.card::before',
    ]);
  });
});

describe('pseudo-element states through every rendering mode', () => {
  const styles: Styles = {
    Icon: {
      $: 'a::before',
      content: { '': '"off"', '@own([rel="next"])': '"on"' },
    },
    Part: {
      $: '@::part(label)',
      color: { '': '#text', '@own(:focus)': '#accent' },
    },
  };

  const expected = [
    '.card a::before',
    '.card [data-element="Part"]::part(label):where(:not(:focus))',
    '.card [data-element="Part"]::part(label):where(:focus)',
  ];

  function cssSelectors(css: string): string[] {
    return [...css.matchAll(/^([^{@\n][^{]*?) \{/gm)].map((m) => m[1]);
  }

  it('extractStylesForSelector (zero, tastyStatic selector mode)', () => {
    const { css } = extractStylesForSelector('.card', styles);
    expect(cssSelectors(css).sort()).toEqual([...expected].sort());
    expect(warnings).toContain('PSEUDO_ELEMENT_STATE_IGNORED');
  });

  it('extractStylesWithChunks (zero, tastyStatic class mode)', () => {
    const css = extractStylesWithChunks(styles)
      .map((chunk) => chunk.css)
      .join('\n');
    for (const selector of expected) {
      expect(css).toContain(selector.replace('.card', ''));
    }
    expect(css).not.toContain('rel=');
  });

  it('SSR: tasty() styles and useGlobalStyles()', () => {
    const collector = createServerStyleCollector();
    runWithCollector(collector, () => {
      computeStyles(styles);
      useGlobalStyles('.card', styles);
      useGlobalStyles('.global::before', {
        content: { '': '"off"', ':hover': '"on"', '[data-on]': '"x"' },
      });
    });
    const css = collector.getCSS();

    for (const selector of expected) {
      // Once from useGlobalStyles('.card'), once under the component class.
      const fragment = selector.replace('.card', '');
      expect(css.split(fragment).length - 1).toBe(2);
    }
    expect(css).toContain('.global::before:where(:hover)');
    expect(css).not.toContain('rel=');
    expect(css).not.toContain('data-on');
  });
});
