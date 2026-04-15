/**
 * @vitest-environment happy-dom
 */
import { computeStyles } from './compute-styles';
import { destroy, getCssText } from './injector';

describe('computeStyles with root option', () => {
  let host: HTMLDivElement;
  let shadowRoot: ShadowRoot;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
  });

  afterEach(() => {
    destroy(shadowRoot);
    destroy();
    host.remove();
  });

  it('injects styles into a shadow root when root is provided', () => {
    const result = computeStyles(
      { display: 'flex', color: 'red' },
      { root: shadowRoot },
    );

    expect(result.className).toMatch(/^t[a-z0-9]+/);

    const shadowCSS = getCssText({ root: shadowRoot });
    expect(shadowCSS).toContain('display: flex');
    expect(shadowCSS).toContain('color: red');

    const documentCSS = getCssText();
    expect(documentCSS).not.toContain(result.className);
  });

  it('injects into document when root is omitted', () => {
    const result = computeStyles({ display: 'grid' });

    expect(result.className).toMatch(/^t[a-z0-9]+/);

    const documentCSS = getCssText();
    expect(documentCSS).toContain('display: grid');

    const shadowCSS = getCssText({ root: shadowRoot });
    expect(shadowCSS).toBe('');
  });

  it('isolates styles per root — same styles, different roots', () => {
    const styles = { padding: '1x', color: 'blue' };

    const docResult = computeStyles(styles);
    const shadowResult = computeStyles(styles, { root: shadowRoot });

    expect(docResult.className).toBe(shadowResult.className);

    const documentCSS = getCssText();
    const shadowCSS = getCssText({ root: shadowRoot });

    expect(documentCSS).toContain('color: blue');
    expect(shadowCSS).toContain('color: blue');
  });
});
