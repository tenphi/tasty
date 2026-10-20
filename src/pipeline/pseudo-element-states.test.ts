/**
 * States on a selector that ends in a pseudo-element (tenphi/tasty#406).
 *
 * No `:where()` may follow a pseudo-element, so a state for the element a
 * selector targets attaches to the originating element, before the
 * pseudo-element. Pseudo-classes written after the pseudo-element qualify the
 * pseudo-element and stay after it. The browser half of this suite,
 * `pseudo-element-states.test.tsx`, checks that Chromium keeps these rules
 * and applies them.
 */
import { computeStyles } from '../compute-styles';
import { useGlobalStyles } from '../hooks/useGlobalStyles';
import { createServerStyleCollector, runWithCollector } from '../ssr';
import type { Styles } from '../styles/types';
import { extractStylesForSelector, extractStylesWithChunks } from '../zero';

import { renderStyles } from './index';

function selectors(styles: Styles, base = '.root'): string[] {
  return renderStyles(styles, base).map((rule) => rule.selector);
}

/** One sub-element whose color depends on its own `[open]` state. */
function ownState($: string): Styles {
  return { Target: { $, color: { '': 'red', '@own([open])': 'blue' } } };
}

describe('@own() on a sub-element whose $ ends in a pseudo-element', () => {
  it.each([
    ['a::before', ' a', '::before'],
    ['dialog::backdrop', ' dialog', '::backdrop'],
    ['@::marker', ' [data-element="Target"]', '::marker'],
    ['@::after', ' [data-element="Target"]', '::after'],
    ['input::placeholder', ' input', '::placeholder'],
    ['summary::-webkit-details-marker', ' summary', '::-webkit-details-marker'],
    ['>@::part(label)', ' > [data-element="Target"]', '::part(label)'],
    ['@::slotted(span)', ' [data-element="Target"]', '::slotted(span)'],
    ['@::highlight(found)', ' [data-element="Target"]', '::highlight(found)'],
    ['::before', ' ', '::before'],
    // Legacy single-colon pseudo-elements.
    ['a:before', ' a', ':before'],
    ['a:after', ' a', ':after'],
    ['p:first-line', ' p', ':first-line'],
    ['p:first-letter', ' p', ':first-letter'],
    // A pseudo-class before the pseudo-element belongs to the originating
    // element; one after it qualifies the pseudo-element and stays there.
    ['li:first-child::marker', ' li:first-child', '::marker'],
    ['@::part(label):hover', ' [data-element="Target"]', '::part(label):hover'],
    [
      '>@::-webkit-scrollbar-thumb:hover',
      ' > [data-element="Target"]',
      '::-webkit-scrollbar-thumb:hover',
    ],
  ])('attaches the state to %s before the pseudo-element', ($, el, pseudo) => {
    expect(selectors(ownState($))).toEqual([
      `.root${el}:where(:not([open]))${pseudo}`,
      `.root${el}:where([open])${pseudo}`,
    ]);
  });

  it.each([
    ['>@', ' > [data-element="Target"]'],
    ['>@:hover', ' > [data-element="Target"]:hover'],
    ['a.link', ' a.link'],
    ['a[title="x::y"]', ' a[title="x::y"]'],
    ['li:not(:first-child)', ' li:not(:first-child)'],
  ])('appends the state to %s, which has no pseudo-element', ($, el) => {
    expect(selectors(ownState($))).toEqual([
      `.root${el}:where(:not([open]))`,
      `.root${el}:where([open])`,
    ]);
  });

  it('places the state before the pseudo-element of each item in a list', () => {
    expect(
      selectors(ownState('summary::marker, summary::-webkit-details-marker')),
    ).toEqual([
      '.root summary:where(:not([open]))::marker',
      '.root summary:where(:not([open]))::-webkit-details-marker',
      '.root summary:where([open])::marker',
      '.root summary:where([open])::-webkit-details-marker',
    ]);
  });

  it('handles negated and OR-ed own states', () => {
    expect(
      selectors({
        Target: {
          $: 'a::before',
          color: { '': 'red', '!@own([open])': 'blue' },
        },
      }),
    ).toEqual([
      '.root a:where([open])::before',
      '.root a:where(:not([open]))::before',
    ]);
    expect(
      selectors({
        Target: {
          $: 'b::after',
          color: { '': 'red', '@own([open] | :hover)': 'blue' },
        },
      }),
    ).toEqual([
      '.root b:where(:not(:hover, [open]))::after',
      '.root b:where(:is(:hover, [open]))::after',
    ]);
  });

  it('keeps root states before the sub-element and own states on it', () => {
    expect(
      selectors({
        Target: {
          $: 'a::before',
          color: { '': 'red', ':focus': 'green', '@own([open])': 'blue' },
        },
      }),
    ).toEqual([
      '.root:where(:not(:focus)) a:where(:not([open]))::before',
      '.root:where(:focus) a:where(:not([open]))::before',
      '.root a:where([open])::before',
    ]);
  });

  it('attaches own states on a & key to the root, before the pseudo-element', () => {
    expect(
      selectors({
        '&::before, &:after': { color: { '': 'red', '@own([open])': 'blue' } },
      }),
    ).toEqual([
      '.root:where(:not([open]))::before',
      '.root:where(:not([open])):after',
      '.root:where([open])::before',
      '.root:where([open]):after',
    ]);
  });

  it('builds the same fragments in component mode', () => {
    const { rules } = renderStyles({
      Icon: {
        $: 'a::before',
        content: { '': 'none', '@own([rel="next"])': '""' },
      },
    });
    expect(rules.map((rule) => rule.selector)).toEqual([
      ' a:where(:not([rel="next"]))::before',
      ' a:where([rel="next"])::before',
    ]);
  });
});

describe('root states on a direct selector that ends in a pseudo-element', () => {
  it('attaches root and @parent states before the pseudo-element', () => {
    expect(
      selectors(
        {
          color: { '': 'red', ':hover': 'blue', '@parent(.dark)': 'green' },
        },
        '.card::before',
      ),
    ).toEqual([
      '.card:where(:not(:hover)):where(:not(.dark *))::before',
      '.card:where(:hover):where(:not(.dark *))::before',
      '.card:where(.dark *)::before',
    ]);
  });

  it('attaches @root states to a root selector before the pseudo-element', () => {
    expect(
      selectors(
        { color: { '': 'red', ':hover': 'blue', '@root(.dark)': 'green' } },
        'html::before',
      ),
    ).toEqual([
      'html:where(:not(.dark)):where(:not(:hover))::before',
      'html:where(:not(.dark)):where(:hover)::before',
      'html:where(.dark)::before',
    ]);
  });

  it('keeps a pseudo-class written after the pseudo-element after it', () => {
    expect(
      selectors(
        { '&:active': { color: { '': 'red', ':focus': 'blue' } } },
        'div::-webkit-scrollbar-thumb:hover',
      ),
    ).toEqual([
      'div:where(:not(:focus))::-webkit-scrollbar-thumb:hover:active',
      'div:where(:focus)::-webkit-scrollbar-thumb:hover:active',
    ]);
  });

  it('handles each item of a selector list on its own', () => {
    expect(
      selectors(
        { color: { '': 'red', ':hover': 'blue' } },
        '.a::before, .b:after, .c',
      ),
    ).toEqual([
      '.a:where(:not(:hover))::before, .b:where(:not(:hover)):after, .c:where(:not(:hover))',
      '.a:where(:hover)::before, .b:where(:hover):after, .c:where(:hover)',
    ]);
  });

  it('leaves a stateless rule unchanged', () => {
    expect(selectors({ color: 'red' }, '.card::before')).toEqual([
      '.card::before',
    ]);
  });
});

describe('pseudo-element states through every rendering mode', () => {
  const issueStyles: Styles = {
    Icon: { $: 'a::before', content: { '': null, '@own([rel="next"])': '""' } },
    Backdrop: {
      $: 'dialog::backdrop',
      opacity: { '': '0', '@own([open])': '1' },
    },
    Marker: {
      $: '@::marker',
      color: { '': '#text', '@own(:hover)': '#accent' },
    },
  };

  const expected = [
    '.card a:where([rel="next"])::before',
    '.card dialog:where(:not([open]))::backdrop',
    '.card dialog:where([open])::backdrop',
    '.card [data-element="Marker"]:where(:not(:hover))::marker',
    '.card [data-element="Marker"]:where(:hover)::marker',
  ];

  function cssSelectors(css: string): string[] {
    return [...css.matchAll(/^([^{@\n][^{]*?) \{/gm)].map((m) => m[1]);
  }

  it('extractStylesForSelector (zero, tastyStatic selector mode)', () => {
    const { css } = extractStylesForSelector('.card', issueStyles);
    expect(cssSelectors(css).sort()).toEqual([...expected].sort());
  });

  it('extractStylesWithChunks (zero, tastyStatic class mode)', () => {
    const css = extractStylesWithChunks(issueStyles)
      .map((chunk) => chunk.css)
      .join('\n');
    for (const selector of expected) {
      expect(css).toContain(selector.replace('.card', ''));
    }
    expect(css).not.toMatch(/::[\w-]+:where\(/);
  });

  it('SSR: tasty() styles and useGlobalStyles()', () => {
    const collector = createServerStyleCollector();
    runWithCollector(collector, () => {
      computeStyles(issueStyles);
      useGlobalStyles('.card', issueStyles);
      useGlobalStyles('.global::before', {
        content: { '': '"off"', ':hover': '"on"' },
      });
    });
    const css = collector.getCSS();

    for (const selector of expected) {
      expect(css).toContain(selector);
      expect(css).toContain(selector.replace('.card', ''));
    }
    expect(css).toContain('.global:where(:hover)::before');
    expect(css).not.toMatch(/::[\w-]+:where\(/);
  });
});
