import { configure, resetConfig } from '../config';
import { getRawCSSText } from '../injector';
import { ServerStyleCollector } from '../ssr/collector';
import { registerSSRCollectorGetter } from '../ssr/ssr-collector-ref';

import { useRawCSS } from './useRawCSS';

describe('useRawCSS', () => {
  beforeEach(() => {
    resetConfig();
    configure({ forceTextInjection: true });
    document.head
      .querySelectorAll('[data-tasty-raw]')
      .forEach((element) => element.remove());
  });

  afterEach(() => {
    registerSSRCollectorGetter(null as never);
    document.head
      .querySelectorAll('[data-tasty-raw]')
      .forEach((element) => element.remove());
    resetConfig();
  });

  it('replaces client CSS in an identified slot', () => {
    useRawCSS('.raw-slot { color: red; }', { id: 'theme' });
    useRawCSS('.raw-slot { color: blue; }', { id: 'theme' });

    const css = getRawCSSText();
    expect(css).toContain('color: blue');
    expect(css).not.toContain('color: red');
  });

  it('deduplicates unidentified client CSS by content', () => {
    const css = '.raw-dedup { color: green; }';
    useRawCSS(css);
    useRawCSS(css);

    expect(getRawCSSText().split(css)).toHaveLength(2);
  });

  it('skips a factory while its identified dependencies are unchanged', () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return `.raw-factory { --call: ${calls}; }`;
    };

    useRawCSS(factory, [1], { id: 'factory' });
    useRawCSS(factory, [1], { id: 'factory' });
    useRawCSS(factory, [2], { id: 'factory' });

    expect(calls).toBe(2);
    expect(getRawCSSText()).toContain('--call: 2');
  });

  it('preserves replacement semantics for SSR slots', () => {
    const collector = new ServerStyleCollector();
    registerSSRCollectorGetter(() => collector);

    useRawCSS('.ssr-raw { color: red; }', { id: 'theme' });
    useRawCSS('.ssr-raw { color: blue; }', { id: 'theme' });

    expect(collector.getCSS()).toBe('.ssr-raw { color: blue; }');
  });
});
