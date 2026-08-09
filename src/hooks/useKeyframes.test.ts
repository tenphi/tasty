import { configure, resetConfig } from '../config';
import { getCSSText } from '../injector';

import { useKeyframes } from './useKeyframes';

describe.each([
  ['CSSOM injection', false],
  ['text injection', true],
])('useKeyframes (%s)', (_label, forceTextInjection) => {
  beforeEach(() => {
    resetConfig();
    configure({ forceTextInjection });
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    resetConfig();
  });

  /**
   * Every `@keyframes` block in the injected CSS, whole.
   *
   * Matched by brace balance rather than by line: `CSSKeyframesRule.cssText`
   * serializes across several lines, so line filtering would only ever return
   * the `@keyframes <name> {` header and never the steps.
   */
  const keyframeRules = () => {
    const css = getCSSText();
    const blocks: string[] = [];
    const header = /@keyframes\s+[^{]*\{/g;

    for (let m = header.exec(css); m; m = header.exec(css)) {
      let depth = 1;
      let i = m.index + m[0].length;

      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }

      blocks.push(css.slice(m.index, i));
      header.lastIndex = i;
    }

    return blocks;
  };

  it('should dedupe identical steps to one rule and name', () => {
    const steps = { from: { opacity: 0 }, to: { opacity: 1 } };

    const first = useKeyframes(steps);
    const second = useKeyframes({ ...steps });

    expect(second).toBe(first);
    expect(keyframeRules()).toHaveLength(1);
  });

  it('should replace a named slot when its steps change', () => {
    const pulse = (scale: number) =>
      useKeyframes(
        () => ({
          '0%': { transform: 'scale(1)' },
          '100%': { transform: `scale(${scale})` },
        }),
        [scale],
        { name: 'pulse' },
      );

    expect(pulse(1.1)).toBe('pulse');
    expect(pulse(1.5)).toBe('pulse');
    expect(pulse(2)).toBe('pulse');

    const rules = keyframeRules();

    // One rule, not three stacked — the old ones are disposed, and the slot
    // reclaims the plain `pulse` name instead of minting `pulse-tk0`, `pulse-tk1`
    expect(rules).toHaveLength(1);

    // The surviving rule holds the latest steps only. Asserted in both modes:
    // Chromium's `CSSKeyframesRule.cssText` round-trips the steps, so the CSSOM
    // path is observable too.
    expect(rules[0]).toContain('scale(2)');
    expect(rules[0]).not.toContain('scale(1.1)');
    expect(rules[0]).not.toContain('scale(1.5)');
  });

  it('should not re-inject a named slot when deps are unchanged', () => {
    const factory = vi.fn(() => ({ from: { opacity: 0 }, to: { opacity: 1 } }));

    const first = useKeyframes(factory, [1], { name: 'fade' });
    const second = useKeyframes(factory, [1], { name: 'fade' });

    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(keyframeRules()).toHaveLength(1);
  });

  it('should keep anonymous keyframes permanent and separate', () => {
    useKeyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
    useKeyframes({ from: { opacity: 0 }, to: { opacity: 0.5 } });

    expect(keyframeRules()).toHaveLength(2);
  });

  it('should keep named slots separate per root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });

    const steps = { from: { opacity: 0 }, to: { opacity: 1 } };

    useKeyframes(steps, { name: 'shared' });
    useKeyframes(
      { from: { opacity: 1 }, to: { opacity: 0 } },
      { name: 'shared', root: shadowRoot },
    );

    // The shadow root's slot must not evict the document's rule
    expect(keyframeRules()).toHaveLength(1);
    expect(getCSSText({ root: shadowRoot })).toContain('@keyframes shared');

    host.remove();
  });
});
