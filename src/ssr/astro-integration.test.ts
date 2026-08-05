/**
 * Guards the wiring between `tastyIntegration()` and the middleware modules it
 * registers with Astro.
 *
 * The 3.0.0 regression this covers: the integration pointed `addMiddleware()`
 * at `new URL('./astro-middleware.js', import.meta.url)`. The bundler hoisted
 * `tastyIntegration` into a shared chunk one directory above `dist/ssr/`, so
 * the URL resolved to a file that does not exist and every Astro build failed.
 * The entrypoint is now a package subpath, and the test below asserts that the
 * subpath is actually reachable — declared in `exports` and emitted by the
 * build — rather than merely that some string was passed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSSRCollector } from './async-storage';
import { tastyIntegration } from './astro';

const REPO_ROOT = resolve(__dirname, '../..');

interface Registered {
  middleware: { entrypoint: string | URL; order: 'pre' | 'post' }[];
  scripts: { stage: string; content: string }[];
}

/** Run `astro:config:setup` against a stub and record what it registered. */
function runConfigSetup(options?: { islands?: boolean }): Registered {
  const registered: Registered = { middleware: [], scripts: [] };

  const hook = tastyIntegration(options).hooks['astro:config:setup'] as unknown;

  (
    hook as (arg: {
      addMiddleware: (m: Registered['middleware'][number]) => void;
      injectScript: (stage: string, content: string) => void;
    }) => void
  )({
    addMiddleware: (m) => registered.middleware.push(m),
    injectScript: (stage, content) =>
      registered.scripts.push({ stage, content }),
  });

  return registered;
}

function readPkg(): {
  name: string;
  exports: Record<string, { import?: string } | string>;
} {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
}

/** Entry keys declared in `tsdown.config.ts`, e.g. `ssr/astro-middleware`. */
function readBuildEntryKeys(): string[] {
  const config = readFileSync(resolve(REPO_ROOT, 'tsdown.config.ts'), 'utf8');
  const entryBlock = config.slice(
    config.indexOf('entry: {'),
    config.indexOf('},', config.indexOf('entry: {')),
  );

  return [...entryBlock.matchAll(/^\s*'?([\w/-]+)'?:/gm)]
    .map((m) => m[1])
    .filter((key) => key !== 'entry');
}

describe('tastyIntegration', () => {
  it('registers middleware as a pre-order package subpath, not a relative URL', () => {
    const { middleware } = runConfigSetup();

    expect(middleware).toHaveLength(1);
    expect(middleware[0].order).toBe('pre');
    // A URL would re-introduce the 3.0.0 bug: it is resolved against the
    // location of the emitted chunk, which the bundler is free to move.
    expect(typeof middleware[0].entrypoint).toBe('string');
    expect(middleware[0].entrypoint).toBe('@tenphi/tasty/ssr/astro-middleware');
  });

  it('uses the static middleware entrypoint when islands are disabled', () => {
    const { middleware } = runConfigSetup({ islands: false });

    expect(middleware[0].entrypoint).toBe(
      '@tenphi/tasty/ssr/astro-middleware-static',
    );
  });

  it('injects the hydration script only when islands are enabled', () => {
    expect(runConfigSetup().scripts).toEqual([
      {
        stage: 'before-hydration',
        content: `import "@tenphi/tasty/ssr/astro-client";`,
      },
    ]);
    expect(runConfigSetup({ islands: false }).scripts).toEqual([]);
  });

  it.each([{ islands: true }, { islands: false }])(
    'registers an entrypoint that is exported and built (islands: $islands)',
    (options) => {
      const entrypoint = runConfigSetup(options).middleware[0]
        .entrypoint as string;

      const pkg = readPkg();
      expect(entrypoint.startsWith(`${pkg.name}/`)).toBe(true);

      const subpath = `.${entrypoint.slice(pkg.name.length)}`;
      const entry = pkg.exports[subpath];
      expect(
        entry,
        `${entrypoint} is not declared in package.json "exports"`,
      ).toBeDefined();

      const target =
        typeof entry === 'string' ? entry : (entry.import as string);
      expect(target).toMatch(/^\.\/dist\/.+\.js$/);

      // The mapped file only exists if the build emits it.
      const entryKey = target.replace(/^\.\/dist\//, '').replace(/\.js$/, '');
      expect(
        readBuildEntryKeys(),
        `${target} is not produced by any tsdown entry`,
      ).toContain(entryKey);
    },
  );
});

describe('astro middleware entrypoints', () => {
  /**
   * Render a page through `onRequest`, collecting one style chunk so the
   * middleware has both CSS and a rendered class name to emit.
   */
  async function render(
    onRequest: (
      context: unknown,
      next: () => Promise<Response>,
    ) => Promise<Response>,
  ): Promise<string> {
    const next = async () => {
      const collector = getSSRCollector();
      const { className } = collector!.allocateClassName('t');
      collector!.collectChunk('t', className, [
        { $: '', declarations: { color: 'red' } },
      ] as never);

      return new Response('<html><head></head><body>hi</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    return (await onRequest({}, next)).text();
  }

  /**
   * Each variant must bake its transfer-cache setting in. The integration runs
   * when the Astro config is loaded, while the middleware is evaluated in the
   * server runtime — a different process for built output — so module-level
   * state set by the former never reaches the latter.
   */
  it('emits the class-list transfer script', async () => {
    const { onRequest } = await import('./astro-middleware');
    const html = await render(onRequest);

    expect(html).toContain('<style data-tasty-ssr>');
    expect(html).toContain('window.__TASTY__');
  });

  it('emits no client JS in the static variant', async () => {
    const { onRequest } = await import('./astro-middleware-static');
    const html = await render(onRequest);

    expect(html).toContain('<style data-tasty-ssr>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('window.__TASTY__');
  });
});
