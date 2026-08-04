/**
 * @vitest-environment jsdom
 */
import { ServerStyleCollector } from '../ssr/collector';
import {
  registerSSRCollectorGetter,
  registerSSRCollectorGetterGlobal,
} from '../ssr/ssr-collector-ref';
import { useFunction } from './useFunction';

/**
 * The client injector path can't be asserted in jsdom/happy-dom because their
 * CSSOM rejects `@function` at `insertRule`. We exercise the hook through the
 * SSR collector (text-based) instead, which is the same code path used for
 * server rendering.
 */
describe('useFunction', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let collector: ServerStyleCollector;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
    collector = new ServerStyleCollector();
    registerSSRCollectorGetter(() => collector);
  });

  afterEach(() => {
    registerSSRCollectorGetter(null as never);
    registerSSRCollectorGetterGlobal(null as never);
    consoleWarnSpy.mockRestore();
  });

  it('collects a @function rule via the SSR collector', () => {
    useFunction('$$negative', { args: ['$value'], result: '(-1 * $value)' });

    const css = collector.getCSS();
    expect(css).toContain(
      '@function --negative(--value) { result: calc(-1 * var(--value)); }',
    );
  });

  it('deduplicates by function name across calls', () => {
    useFunction('$$dup', { args: ['$value'], result: '$value' });
    useFunction('$$dup', { args: ['$value'], result: '$value' });

    const css = collector.getCSS();
    const matches = css.match(/@function --dup/g);
    expect(matches?.length).toBe(1);
  });

  it('accepts $name and --name forms for the function name', () => {
    useFunction('$single', { args: ['$value'], result: '$value' });
    useFunction('--double', { args: ['$value'], result: '$value' });

    const css = collector.getCSS();
    expect(css).toContain('@function --single(--value)');
    expect(css).toContain('@function --double(--value)');
  });

  it('warns and does nothing when the name is empty', () => {
    useFunction('', { args: ['$value'], result: '$value' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('function name is required'),
    );
    expect(collector.getCSS()).not.toContain('@function');
  });
});
