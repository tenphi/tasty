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
