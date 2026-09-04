import { configure, resetConfig } from './config';
import { computeStyles } from './compute-styles';
import { destroy, getCSSText } from './injector';
import { ServerStyleCollector } from './ssr/collector';
import type { Styles } from './styles/types';

function createAncillaryStyles(): Styles {
  return {
    '@property': {
      '$compute-progress': {
        syntax: '<number>',
        inherits: false,
        initialValue: '0',
      },
    },
    '@font-face': {
      'Compute Styles Test': [
        {
          src: 'url("/compute-regular.woff2") format("woff2")',
          fontWeight: 400,
        },
        {
          src: 'url("/compute-bold.woff2") format("woff2")',
          fontWeight: 700,
        },
      ],
    },
    '@counter-style': {
      'compute-dashes': {
        system: 'cyclic',
        symbols: '"\u2014"',
        suffix: '" "',
      },
    },
    '@keyframes': {
      'compute-fade': {
        from: { opacity: 0 },
        to: { opacity: 1 },
      },
    },
    animation: 'compute-fade 1s',
    opacity: '$compute-progress',
    '$compute-offset': '10px',
  };
}

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

    const shadowCSS = getCSSText({ root: shadowRoot });
    expect(shadowCSS).toContain('display: flex');
    expect(shadowCSS).toContain('color: red');

    const documentCSS = getCSSText();
    expect(documentCSS).not.toContain(result.className);
  });

  it('injects into document when root is omitted', () => {
    const result = computeStyles({ display: 'grid' });

    expect(result.className).toMatch(/^t[a-z0-9]+/);

    const documentCSS = getCSSText();
    expect(documentCSS).toContain('display: grid');

    const shadowCSS = getCSSText({ root: shadowRoot });
    expect(shadowCSS).toBe('');
  });

  it('isolates styles per root — same styles, different roots', () => {
    const styles = { padding: '1x', color: 'blue' };

    const docResult = computeStyles(styles);
    const shadowResult = computeStyles(styles, { root: shadowRoot });

    expect(docResult.className).toBe(shadowResult.className);

    const documentCSS = getCSSText();
    const shadowCSS = getCSSText({ root: shadowRoot });

    expect(documentCSS).toContain('color: blue');
    expect(shadowCSS).toContain('color: blue');
  });
});

describe('computeStyles @function handling', () => {
  afterEach(() => {
    destroy();
    resetConfig();
  });

  it('injects a component-local @function through the client CSSOM path', () => {
    // The counterpart to the SSR-collector cases below: no collector, and
    // `insertRule` rather than text. Chromium implements `@function`, so the
    // rule survives insertion and reads back out of the sheet.
    configure({ forceTextInjection: false });

    computeStyles({
      '@function': {
        $$negative: { args: ['$value'], result: '(-1 * $value)' },
      },
      marginTop: '$$negative(10px)',
    });

    const css = getCSSText();

    expect(css).toContain('@function --negative(--value)');
    expect(css).toContain('--negative(10px)');
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

describe('computeStyles ancillary resources', () => {
  beforeEach(() => resetConfig());

  afterEach(() => {
    destroy();
    resetConfig();
  });

  it('injects local resources once into the requested root', () => {
    configure({ forceTextInjection: true });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const styles = createAncillaryStyles();

    try {
      computeStyles(styles, { root: shadowRoot });
      computeStyles(styles, { root: shadowRoot });

      const css = getCSSText({ root: shadowRoot });
      expect(css.match(/@property --compute-progress/g)).toHaveLength(1);
      expect(css.match(/@font-face/g)).toHaveLength(2);
      expect(css).toContain('/compute-regular.woff2');
      expect(css).toContain('/compute-bold.woff2');
      expect(css.match(/@counter-style compute-dashes/g)).toHaveLength(1);
      expect(css.match(/@keyframes compute-fade-[a-z0-9]+/g)).toHaveLength(1);

      const documentCSS = getCSSText();
      expect(documentCSS).not.toContain('--compute-progress');
      expect(documentCSS).not.toContain('compute-dashes');
    } finally {
      destroy(shadowRoot);
      host.remove();
    }
  });

  it('collects local resources once for SSR', () => {
    const collector = new ServerStyleCollector();
    const styles = createAncillaryStyles();

    computeStyles(styles, { ssrCollector: collector });
    computeStyles(styles, { ssrCollector: collector });

    const css = collector.getCSS();
    expect(css.match(/@property --compute-progress/g)).toHaveLength(1);
    expect(css.match(/@property --compute-offset/g)).toHaveLength(1);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('/compute-regular.woff2');
    expect(css).toContain('/compute-bold.woff2');
    expect(css.match(/@counter-style compute-dashes/g)).toHaveLength(1);
    expect(css.match(/@keyframes compute-fade-[a-z0-9]+/g)).toHaveLength(1);
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
