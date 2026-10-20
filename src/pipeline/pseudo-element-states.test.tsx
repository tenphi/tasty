/**
 * States on a selector that ends in a pseudo-element, checked in Chromium
 * (tenphi/tasty#406). A state written after a pseudo-element makes the whole
 * rule an invalid selector, so the browser drops it and even the default
 * branch never applies. `pseudo-element-states.test.ts` pins the text.
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

const ON = 'rgb(0, 128, 0)';
const OFF = 'rgb(255, 0, 0)';
const color = { '': 'rgb(255 0 0)', '@own([data-on])': 'rgb(0 128 0)' };

const styles: Styles = {
  Link: {
    $: 'a::before',
    content: { '': '"off"', '@own([rel="next"])': '"on"' },
  },
  Legacy: { $: 'b:after', content: { '': '"off"', '@own([data-on])': '"on"' } },
  Letter: { $: 'p:first-letter', color },
  Item: { $: '@::marker', color },
  Field: { $: '@::placeholder', color },
  Summary: { $: 'summary::marker, summary::-webkit-details-marker', color },
  Host: { $: '@::part(label)', color },
  Dialog: { $: '@::backdrop', opacity: { '': '0.25', '@own([open])': '0.75' } },
  // Not observable through computed styles; the rules must still be kept.
  Thumb: { $: '@::-webkit-scrollbar-thumb:hover', color },
  Slot: { $: '@::slotted(span)', color },
  Found: { $: '@::highlight(found)', color },
  '&::after': { content: { '': '"off"', '@own([data-root-on])': '"on"' } },
};

/** Selectors that only the parser can vouch for. */
const KEPT = [
  /\[data-element="Thumb"\]:where\(\[data-on\]\)::-webkit-scrollbar-thumb:hover/,
  /\[data-element="Slot"\]:where\(\[data-on\]\)::slotted\(span\)/,
  /\[data-element="Found"\]:where\(\[data-on\]\)::highlight\(found\)/,
  /summary:where\(\[data-on\]\)::-webkit-details-marker/,
];

const FIXTURE = `
  <a rel="next"></a><a></a>
  <b data-on></b><b></b>
  <p data-on>on</p><p>off</p>
  <ul><li data-element="Item" data-on>on</li><li data-element="Item">off</li></ul>
  <input data-element="Field" data-on placeholder="on" />
  <input data-element="Field" placeholder="off" />
  <details><summary data-on>on</summary></details>
  <details><summary>off</summary></details>
  <div data-element="Host" data-on></div><div data-element="Host"></div>
  <dialog data-element="Dialog"></dialog>
`;

function fill(root: HTMLElement) {
  root.setAttribute('data-root-on', '');
  root.innerHTML = FIXTURE;
  for (const host of root.querySelectorAll('[data-element="Host"]')) {
    host.attachShadow({ mode: 'open' }).innerHTML =
      '<span part="label"></span>';
  }
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
  const q = (selector: string) => root.querySelectorAll(selector);

  const [linkOn, linkOff] = q('a');
  expect(pseudo(linkOn, '::before').content).toBe('"on"');
  expect(pseudo(linkOff, '::before').content).toBe('"off"');

  const [bOn, bOff] = q('b');
  expect(pseudo(bOn, '::after').content).toBe('"on"');
  expect(pseudo(bOff, '::after').content).toBe('"off"');

  const [pOn, pOff] = q('p');
  expect(pseudo(pOn, '::first-letter').color).toBe(ON);
  expect(pseudo(pOff, '::first-letter').color).toBe(OFF);

  const [liOn, liOff] = q('li');
  expect(pseudo(liOn, '::marker').color).toBe(ON);
  expect(pseudo(liOff, '::marker').color).toBe(OFF);

  const [inputOn, inputOff] = q('input');
  expect(pseudo(inputOn, '::placeholder').color).toBe(ON);
  expect(pseudo(inputOff, '::placeholder').color).toBe(OFF);

  const [summaryOn, summaryOff] = q('summary');
  expect(pseudo(summaryOn, '::marker').color).toBe(ON);
  expect(pseudo(summaryOff, '::marker').color).toBe(OFF);

  const [hostOn, hostOff] = q('[data-element="Host"]');
  const part = (host: Element) => host.shadowRoot!.querySelector('span')!;
  expect(getComputedStyle(part(hostOn)).color).toBe(ON);
  expect(getComputedStyle(part(hostOff)).color).toBe(OFF);

  const dialog = root.querySelector('dialog')!;
  dialog.showModal();
  expect(pseudo(dialog, '::backdrop').opacity).toBe('0.75');
  dialog.close();
  expect(pseudo(dialog, '::backdrop').opacity).toBe('0.25');

  expect(pseudo(root, '::after').content).toBe('"on"');
  root.removeAttribute('data-root-on');
  expect(pseudo(root, '::after').content).toBe('"off"');

  const kept = keptSelectors();
  for (const pattern of KEPT) {
    expect(kept.some((selector) => pattern.test(selector))).toBe(true);
  }
  expect(kept.filter((s) => /::[\w-]+(\([^)]*\))?:where\(/.test(s))).toEqual(
    [],
  );
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
    const { container } = render(<Card data-testid="card" />);
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

  it('attach to the originating element', () => {
    useGlobalStyles('.pe-before::before, .pe-after:after', {
      content: { '': '"off"', '[data-on]': '"on"' },
    });
    useGlobalStyles('.pe-field::placeholder', {
      color: { '': 'rgb(255 0 0)', '@parent([data-on])': 'rgb(0 128 0)' },
    });

    const host = document.createElement('div');
    host.innerHTML = `
      <i class="pe-before" data-on></i><i class="pe-before"></i>
      <i class="pe-after" data-on></i><i class="pe-after"></i>
      <div data-on><input class="pe-field" placeholder="on" /></div>
      <div><input class="pe-field" placeholder="off" /></div>
    `;
    document.body.append(host);

    try {
      const [beforeOn, beforeOff] = host.querySelectorAll('.pe-before');
      expect(pseudo(beforeOn, '::before').content).toBe('"on"');
      expect(pseudo(beforeOff, '::before').content).toBe('"off"');

      const [afterOn, afterOff] = host.querySelectorAll('.pe-after');
      expect(pseudo(afterOn, '::after').content).toBe('"on"');
      expect(pseudo(afterOff, '::after').content).toBe('"off"');

      const [fieldOn, fieldOff] = host.querySelectorAll('.pe-field');
      expect(pseudo(fieldOn, '::placeholder').color).toBe(ON);
      expect(pseudo(fieldOff, '::placeholder').color).toBe(OFF);
    } finally {
      host.remove();
    }
  });
});
