/**
 * States on a pseudo-element target, checked in Chromium (tenphi/tasty#406).
 *
 * A state that tests what a pseudo-element has none of (an attribute,
 * modifier, or class) used to come out as `a::before:where([rel])`. Chromium
 * keeps that rule but empties the `:where()`, so neither it nor its negated
 * default ever matched. Those states are now dropped, so the default
 * applies. A pseudo-class state goes after the pseudo-element, where
 * `::part()` can take it. `pseudo-element-states.test.ts` pins the text.
 */
import { cleanup, render } from '@testing-library/react';

import { computeStyles } from '../compute-styles';
import { useGlobalStyles } from '../hooks/useGlobalStyles';
import { destroy } from '../injector';
import { ServerStyleCollector } from '../ssr/collector';
import { formatRules } from '../ssr/format-rules';
import type { Styles } from '../styles/types';
import { tasty } from '../tasty';

import { renderStyles } from './index';
import { setWarningHandler } from './warnings';

const ON = 'rgb(0, 128, 0)';
const OFF = 'rgb(255, 0, 0)';
const color = { '': 'rgb(255 0 0)', '@own([data-on])': 'rgb(0 128 0)' };

const styles: Styles = {
  // Pseudo-class states the pseudo-element itself is in.
  Part: {
    $: '@::part(label)',
    color: { '': 'rgb(255 0 0)', '@own(:focus)': 'rgb(0 128 0)' },
  },
  Thumb: {
    $: '@::-webkit-scrollbar-thumb',
    color: { '': 'rgb(255 0 0)', '@own(:hover)': 'rgb(0 128 0)' },
  },
  // Attribute states a pseudo-element can't have: dropped, default kept.
  Link: {
    $: 'a::before',
    content: { '': '"off"', '@own([rel="next"])': '"on"' },
  },
  Legacy: { $: 'b:after', content: { '': '"off"', '@own([data-on])': '"on"' } },
  Letter: { $: 'p:first-letter', color },
  Item: { $: '@::marker', color },
  Field: { $: '@::placeholder', color },
  Summary: { $: 'summary::marker, summary::-webkit-details-marker', color },
  Dialog: { $: '@::backdrop', opacity: { '': '0.25', '@own([open])': '0.75' } },
  '&::after': { content: { '': '"off"', '@own([data-root-on])': '"on"' } },
};

const FIXTURE = `
  <a rel="next"></a><a></a>
  <b data-on></b><b></b>
  <p data-on>on</p><p>off</p>
  <ul><li data-element="Item" data-on>on</li><li data-element="Item">off</li></ul>
  <input data-element="Field" data-on placeholder="on" />
  <input data-element="Field" placeholder="off" />
  <details><summary data-on>on</summary></details>
  <details><summary>off</summary></details>
  <div data-element="Part"></div>
  <div data-element="Thumb"></div>
  <dialog data-element="Dialog"></dialog>
`;

let restoreWarnings: () => void;

beforeEach(() => {
  restoreWarnings = setWarningHandler(() => {
    /* dropped states warn; asserted in the Node suite */
  });
});

afterEach(() => restoreWarnings());

function fill(root: HTMLElement) {
  root.setAttribute('data-root-on', '');
  root.innerHTML = FIXTURE;
  root
    .querySelector('[data-element="Part"]')!
    .attachShadow({ mode: 'open' }).innerHTML = '<input part="label" />';
}

function pseudo(el: Element, name: string) {
  return getComputedStyle(el, name);
}

/** Every style rule selector the engine kept, across all sheets. */
function keptSelectors(): string[] {
  const out: string[] = [];
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) out.push(rule.selectorText);
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of [
    ...document.styleSheets,
    ...document.adoptedStyleSheets,
  ]) {
    walk(sheet.cssRules);
  }
  return out;
}

function expectStatesApplied(root: HTMLElement) {
  const q = (selector: string) => [...root.querySelectorAll(selector)];

  // The part's own focus.
  const input = q('[data-element="Part"]')[0].shadowRoot!.querySelector(
    'input',
  )!;
  expect(getComputedStyle(input).color).toBe(OFF);
  input.focus();
  expect(getComputedStyle(input).color).toBe(ON);
  input.blur();
  expect(getComputedStyle(input).color).toBe(OFF);

  // Dropped attribute states: the default applies to every element.
  for (const a of q('a')) expect(pseudo(a, '::before').content).toBe('"off"');
  for (const b of q('b')) expect(pseudo(b, '::after').content).toBe('"off"');
  for (const p of q('p')) expect(pseudo(p, '::first-letter').color).toBe(OFF);
  for (const li of q('li')) expect(pseudo(li, '::marker').color).toBe(OFF);
  for (const field of q('input')) {
    expect(pseudo(field, '::placeholder').color).toBe(OFF);
  }
  for (const summary of q('summary')) {
    expect(pseudo(summary, '::marker').color).toBe(OFF);
  }
  expect(pseudo(root, '::after').content).toBe('"off"');

  const dialog = root.querySelector('dialog')!;
  dialog.showModal();
  expect(pseudo(dialog, '::backdrop').opacity).toBe('0.25');
  dialog.close();

  const kept = keptSelectors();
  // The thumb's own hover survives parsing after the pseudo-element.
  expect(
    kept.some((s) =>
      /\[data-element="Thumb"\]::-webkit-scrollbar-thumb:where\(:hover\)/.test(
        s,
      ),
    ),
  ).toBe(true);
  // Nothing was emitted that the engine had to empty.
  expect(kept.filter((s) => s.includes(':where()'))).toEqual([]);
}

describe('states on a sub-element that ends in a pseudo-element', () => {
  afterEach(() => {
    cleanup();
    destroy();
  });

  for (const path of ['pipeline', 'runtime', 'ssr'] as const) {
    it(`apply through ${path}`, () => {
      const collector = path === 'ssr' ? new ServerStyleCollector() : null;
      const result =
        path === 'pipeline'
          ? null
          : computeStyles(
              styles,
              collector ? { ssrCollector: collector } : undefined,
            );
      const sheet = document.createElement('style');
      sheet.textContent =
        path === 'pipeline'
          ? formatRules(renderStyles(styles, '.pe-root'), '')
          : (collector?.getCSS() ?? '');
      document.head.append(sheet);

      const root = document.createElement('div');
      root.className = result?.className ?? 'pe-root';
      fill(root);
      document.body.append(root);

      try {
        expectStatesApplied(root);
      } finally {
        root.remove();
        sheet.remove();
      }
    });
  }

  it('apply through a tasty() component', () => {
    const Card = tasty({ styles });
    const { container } = render(<Card />);
    const root = container.firstElementChild as HTMLElement;
    fill(root);
    expectStatesApplied(root);
  });

  it('apply through useGlobalStyles()', () => {
    useGlobalStyles('.pe-global', styles);
    const root = document.createElement('div');
    root.className = 'pe-global';
    fill(root);
    document.body.append(root);

    try {
      expectStatesApplied(root);
    } finally {
      root.remove();
    }
  });
});

describe('states on a global selector that ends in a pseudo-element', () => {
  afterEach(() => destroy());

  it('apply to the pseudo-element, with ancestry on its element', () => {
    useGlobalStyles('.pe-host::part(label)', {
      color: { '': 'rgb(255 0 0)', ':focus': 'rgb(0 128 0)' },
    });
    useGlobalStyles('.pe-field::placeholder', {
      color: { '': 'rgb(255 0 0)', '@parent([data-on])': 'rgb(0 128 0)' },
    });
    useGlobalStyles('.pe-before::before', {
      content: { '': '"off"', '[data-on]': '"on"' },
    });

    const host = document.createElement('div');
    host.innerHTML = `
      <div class="pe-host"></div>
      <div data-on><input class="pe-field" placeholder="on" /></div>
      <div><input class="pe-field" placeholder="off" /></div>
      <i class="pe-before" data-on></i><i class="pe-before"></i>
    `;
    host.querySelector('.pe-host')!.attachShadow({ mode: 'open' }).innerHTML =
      '<input part="label" />';
    document.body.append(host);

    try {
      const part = host
        .querySelector('.pe-host')!
        .shadowRoot!.querySelector('input')!;
      expect(getComputedStyle(part).color).toBe(OFF);
      part.focus();
      expect(getComputedStyle(part).color).toBe(ON);
      part.blur();

      const [fieldOn, fieldOff] = host.querySelectorAll('.pe-field');
      expect(pseudo(fieldOn, '::placeholder').color).toBe(ON);
      expect(pseudo(fieldOff, '::placeholder').color).toBe(OFF);

      for (const el of host.querySelectorAll('.pe-before')) {
        expect(pseudo(el, '::before').content).toBe('"off"');
      }
    } finally {
      host.remove();
    }
  });
});
