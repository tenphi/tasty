/**
 * @vitest-environment happy-dom
 */
import { configure, resetConfig } from './config';
import { computeStyles } from './compute-styles';
import { destroy, getCssText } from './injector';
import { ServerStyleCollector } from './ssr/collector';

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

/**
 * End-to-end @function handling is asserted through the SSR collector path:
 * jsdom/happy-dom CSSOM rejects `@function` at `insertRule`, so the client
 * injector path is not observable via getCssText in tests.
 */
describe('computeStyles @function handling', () => {
  afterEach(() => {
    destroy();
    resetConfig();
  });

  it('emits a component-local @function and its invocation', () => {
    const collector = new ServerStyleCollector();

    const result = computeStyles(
      {
        '@function': {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
        marginTop: '$$negative(10px)',
      },
      { ssrCollector: collector },
    );

    expect(result.className).toMatch(/^t[a-z0-9]+/);

    const css = collector.getCSS();
    expect(css).toContain(
      '@function --negative(--value) { result: calc(-1 * var(--value)); }',
    );
    // marginTop is expanded into the `margin` shorthand by the margin handler.
    expect(css).toContain('--negative(10px)');
  });

  it('emits a global @function configured via configure()', () => {
    configure({
      functions: {
        $$negative: { args: ['$value'], result: '(-1 * $value)' },
      },
    });

    const collector = new ServerStyleCollector();
    computeStyles(
      { marginTop: '$$negative(10px)' },
      { ssrCollector: collector },
    );

    expect(collector.getCSS()).toContain('@function --negative(--value)');
  });

  it('lets a component-local @function override a global one of the same name', () => {
    configure({
      functions: {
        $$shared: { args: ['$x'], result: '$x' },
      },
    });

    const collector = new ServerStyleCollector();
    computeStyles(
      {
        '@function': {
          $$shared: { args: ['$x'], result: '(2 * $x)' },
        },
        marginTop: '$$shared(10px)',
      },
      { ssrCollector: collector },
    );

    const css = collector.getCSS();
    const matches = css.match(/@function --shared/g);
    expect(matches?.length).toBe(1);
    // Local definition wins
    expect(css).toContain('result: calc(2 * var(--x));');
    expect(css).not.toContain('result: var(--x);');
  });
});

describe('computeStyles @function polyfill (inlining)', () => {
  afterEach(() => {
    destroy();
    resetConfig();
  });

  it('inlines a global function and emits no native @function rule', () => {
    configure({
      polyfills: { functions: true },
      functions: {
        $$negative: { args: ['$value'], result: '(-1 * $value)' },
      },
    });

    const collector = new ServerStyleCollector();
    computeStyles(
      { marginTop: '$$negative(10px)' },
      { ssrCollector: collector },
    );

    const css = collector.getCSS();
    expect(css).not.toContain('@function');
    expect(css).not.toContain('--negative(');
    expect(css).toContain('calc(-1 * 10px)');
  });

  it('inlines a component-local @function and emits no native rule', () => {
    configure({ polyfills: { functions: true } });

    const collector = new ServerStyleCollector();
    computeStyles(
      {
        '@function': {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
        marginTop: '$$negative(10px)',
      },
      { ssrCollector: collector },
    );

    const css = collector.getCSS();
    expect(css).not.toContain('@function');
    expect(css).toContain('calc(-1 * 10px)');
  });
});
