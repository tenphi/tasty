import { computeStyles } from '../compute-styles';
import { configure, resetConfig } from '../config';
import { getCSSText } from '../injector';

import { useGlobalStyles } from './useGlobalStyles';

describe('useGlobalStyles', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should warn and not inject when selector is empty string', () => {
    const result = useGlobalStyles('', {
      padding: '2x',
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('selector is required and cannot be empty'),
    );

    expect(result).toBeUndefined();
  });

  it('should not warn when selector is valid', () => {
    useGlobalStyles('.my-class', {
      padding: '2x',
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle undefined styles without warning', () => {
    useGlobalStyles('.my-class', undefined);

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should handle empty styles object', () => {
    useGlobalStyles('.my-class', {});

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});

// The bug this covers only reproduced in text-injection mode, because deletion
// used to go through CSSOM only. Both modes are exercised so the asymmetry
// cannot come back.
describe.each([
  ['CSSOM injection', false],
  ['text injection', true],
])('useGlobalStyles update tracking (%s)', (_label, forceTextInjection) => {
  beforeEach(() => {
    resetConfig();
    configure({ forceTextInjection });
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    resetConfig();
  });

  const cssFor = (selector: string, root?: Document | ShadowRoot) =>
    getCSSText(root ? { root } : undefined)
      .split('\n')
      .filter((line) => line.includes(selector))
      .join('\n');

  it('should replace the previous injection instead of layering on it', () => {
    useGlobalStyles('.card', { fill: '#red' }, { id: 'card' });
    expect(cssFor('.card')).toContain('var(--red-color)');

    useGlobalStyles('.card', { fill: '#blue' }, { id: 'card' });
    useGlobalStyles('.card', { fill: '#green' }, { id: 'card' });

    const css = cssFor('.card');

    expect(css).toContain('var(--green-color)');
    expect(css).not.toContain('var(--red-color)');
    expect(css).not.toContain('var(--blue-color)');
    // Exactly one rule for the selector, not three stacked
    expect(css.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('should replace when no id is given, keyed by selector', () => {
    useGlobalStyles('.no-id', { fill: '#red' });
    useGlobalStyles('.no-id', { fill: '#blue' });

    const css = cssFor('.no-id');

    expect(css).toContain('var(--blue-color)');
    expect(css).not.toContain('var(--red-color)');
  });

  it('should not re-inject when the styles are unchanged', () => {
    useGlobalStyles('.stable', { fill: '#red' }, { id: 'stable' });
    const before = cssFor('.stable');

    useGlobalStyles('.stable', { fill: '#red' }, { id: 'stable' });

    expect(cssFor('.stable')).toBe(before);
  });

  it('should replace a multi-rule injection wholesale', () => {
    const styles = (color: string) => ({
      fill: color,
      color: { '': '#dark', ':hover': '#purple' },
    });

    useGlobalStyles('.multi', styles('#red'), { id: 'multi' });
    const initialRuleCount = cssFor('.multi')
      .split('\n')
      .filter(Boolean).length;
    expect(initialRuleCount).toBeGreaterThan(1);

    useGlobalStyles('.multi', styles('#blue'), { id: 'multi' });

    const css = cssFor('.multi');

    expect(css).toContain('var(--blue-color)');
    expect(css).not.toContain('var(--red-color)');
    expect(css.split('\n').filter(Boolean)).toHaveLength(initialRuleCount);
  });

  it('should clear the slot when the new styles render no CSS', () => {
    useGlobalStyles('.clearable', { fill: '#red' }, { id: 'clearable' });
    expect(cssFor('.clearable')).toContain('var(--red-color)');

    useGlobalStyles('.clearable', {}, { id: 'clearable' });

    expect(cssFor('.clearable')).toBe('');

    // ...and the slot is reusable afterwards
    useGlobalStyles('.clearable', { fill: '#green' }, { id: 'clearable' });
    expect(cssFor('.clearable')).toContain('var(--green-color)');
  });

  it('should re-inject after configure() replaces the injector', () => {
    useGlobalStyles('.reconfigured', { fill: '#red' }, { id: 'reconfigured' });
    expect(cssFor('.reconfigured')).toContain('var(--red-color)');

    // configure() builds a fresh injector with fresh sheets. The slot's stored
    // dispose handle and styles key belong to the old one, so they must not
    // suppress injection into the new one.
    configure({ forceTextInjection });

    useGlobalStyles('.reconfigured', { fill: '#red' }, { id: 'reconfigured' });

    expect(cssFor('.reconfigured')).toContain('var(--red-color)');
  });

  it('should keep separate slots per root', () => {
    const host1 = document.createElement('div');
    const host2 = document.createElement('div');
    document.body.append(host1, host2);
    const root1 = host1.attachShadow({ mode: 'open' });
    const root2 = host2.attachShadow({ mode: 'open' });

    useGlobalStyles('.shared', { fill: '#red' }, { root: root1 });
    useGlobalStyles('.shared', { fill: '#blue' }, { root: root2 });

    // Neither root evicts the other's rules
    expect(cssFor('.shared', root1)).toContain('var(--red-color)');
    expect(cssFor('.shared', root2)).toContain('var(--blue-color)');

    host1.remove();
    host2.remove();
  });
});

describe('useGlobalStyles in the CSS engine', () => {
  const spinner = {
    animation: 'gs-spin 1s linear infinite',
    '@keyframes': {
      'gs-spin': {
        from: { transform: 'rotate(0deg)' },
        to: { transform: 'rotate(360deg)' },
      },
    },
  };

  const elements: Element[] = [];
  const element = (html: string) => {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    elements.push(host);
    return host.firstElementChild as HTMLElement;
  };
  const keyframesNames = () =>
    [...getCSSText().matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);

  beforeEach(() => {
    resetConfig();
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    elements.splice(0).forEach((el) => el.remove());
    document.documentElement.removeAttribute('data-gs-scheme');
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    resetConfig();
  });

  it('applies states and sub-elements to every item of a selector list', () => {
    useGlobalStyles('.gs-card, .gs-panel', {
      fill: { '': 'rgb(1, 1, 1)', selected: 'rgb(2, 2, 2)' },
      Icon: { color: 'rgb(3, 3, 3)' },
    });

    const card = element(
      '<div class="gs-card"><i data-element="Icon"></i></div>',
    );
    const panel = element('<div class="gs-panel" data-selected></div>');

    expect(getComputedStyle(card).backgroundColor).toBe('rgb(1, 1, 1)');
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(2, 2, 2)');
    expect(getComputedStyle(card.firstElementChild!).color).toBe(
      'rgb(3, 3, 3)',
    );
    expect(getComputedStyle(card).color).not.toBe('rgb(3, 3, 3)');
  });

  it('defines root-state custom properties on the root itself', () => {
    useGlobalStyles(':root', {
      '$gs-gap': { '': '1px', '@root(gs-scheme=dark)': '2px' },
    });
    const gap = () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--gs-gap')
        .trim();

    expect(gap()).toBe('1px');
    document.documentElement.setAttribute('data-gs-scheme', 'dark');
    expect(gap()).toBe('2px');
  });

  it('keeps @starting-style when a rejected list is split', () => {
    // Blink rejects the `-moz-` item, which sends the rule down the split path.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
    useGlobalStyles('.gs-fade::-moz-placeholder, .gs-fade', {
      opacity: { '': 1, '@starting': 0 },
    });
    warn.mockRestore();

    const css = getCSSText();
    expect(css).toMatch(/\.gs-fade \{\s*@starting-style \{\s*opacity: 0;/);
    expect(css).not.toMatch(/\.gs-fade \{\s*opacity: 0;/);
  });

  it('injects local @keyframes the rules animate', () => {
    useGlobalStyles('.gs-spinner', spinner);

    const [name] = keyframesNames();
    expect(name).toMatch(/^gs-spin-\w+$/);
    expect(
      getComputedStyle(element('<i class="gs-spinner"></i>')).animationName,
    ).toBe(name);
  });

  it('releases the keyframes with the slot, unless a class still animates them', () => {
    useGlobalStyles('.gs-spinner', spinner, { id: 'gs-spinner' });
    expect(keyframesNames()).toHaveLength(1);

    useGlobalStyles('.gs-spinner', { opacity: 1 }, { id: 'gs-spinner' });
    expect(keyframesNames()).toEqual([]);

    computeStyles(spinner);
    useGlobalStyles('.gs-spinner', spinner, { id: 'gs-spinner' });
    useGlobalStyles('.gs-spinner', { opacity: 1 }, { id: 'gs-spinner' });
    expect(keyframesNames()).toHaveLength(1);
  });

  it('defines configured root-state tokens and animates configured global styles', () => {
    configure({
      states: { '@gs-dark': '@root(gs-scheme=dark)' },
      tokens: { '$gs-gap': { '': '1px', '@gs-dark': '2px' } },
      globalStyles: { '.gs-configured': spinner },
    });
    computeStyles({ display: 'block' });

    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--gs-gap')
        .trim(),
    ).toBe('1px');

    const [name] = keyframesNames();
    expect(name).toMatch(/^gs-spin-\w+$/);
    expect(
      getComputedStyle(element('<i class="gs-configured"></i>')).animationName,
    ).toBe(name);
  });
});
