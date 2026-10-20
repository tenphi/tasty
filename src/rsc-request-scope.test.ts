import type * as ReactModule from 'react';

import type { RSCStyleCache } from './rsc-cache';

/**
 * `React.cache` caches only in React's `react-server` build, inside a request.
 * Server rendering with the standard build and no collector (Astro without
 * `tastyIntegration()`) has no request scope, and that has to be said out
 * loud rather than silently dropping CSS.
 */
const { react } = vi.hoisted(() => ({
  react: { caching: false },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  const cache = (create: () => RSCStyleCache) => {
    let request: RSCStyleCache | undefined;
    return () => (react.caching ? (request ??= create()) : create());
  };
  return { ...actual, default: { ...actual, cache } };
});

// Each test imports the engine from scratch; under a full parallel run that
// transform alone can take most of the default 5s timeout.
describe(
  'server rendering without a request scope',
  { timeout: 30_000 },
  () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'development');
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      warn.mockRestore();
    });

    /** Server-render two `tasty()` elements and a style function. */
    async function renderPage(): Promise<string> {
      const { createElement, Fragment } = await import('react');
      const { renderToString } = await import('react-dom/server');
      const { tasty, useRawCSS } = await import('./index');

      const Card = tasty({ styles: { color: '#purple' } });
      function Page() {
        useRawCSS('.page { margin: 0; }');
        return createElement(
          Fragment,
          null,
          createElement(Card),
          createElement(Card),
        );
      }

      return renderToString(createElement(Page));
    }

    it('warns once when React.cache does not cache', async () => {
      react.caching = false;
      const html = await renderPage();

      // Correct, if verbose: each element carries its own CSS.
      expect(html.match(/<style data-tasty-rsc/g)).toHaveLength(2);
      expect(html).toContain('color: var(--purple-color)');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain(
        'without a style collector',
      );
      expect(String(warn.mock.calls[0][0])).toContain('tastyIntegration()');
    });

    it('stays quiet inside a Server Components request', async () => {
      react.caching = true;
      await renderPage();

      expect(warn).not.toHaveBeenCalled();
    });

    it('stays quiet for a script that calls computeStyles() itself', async () => {
      react.caching = false;
      const { computeStyles } = await import('./index');

      expect(computeStyles({ color: '#purple' }).css).toContain(
        'color: var(--purple-color)',
      );
      expect(warn).not.toHaveBeenCalled();
    });
  },
);
