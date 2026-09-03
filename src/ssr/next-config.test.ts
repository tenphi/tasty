import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { configure, resetConfig } from '../config';
import { withTastyNext } from './next-config';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tasty-next-shared-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  resetConfig();
  await Promise.all(
    tempDirs.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe('withTastyNext', () => {
  it('writes every eager configured CSS kind and preserves Next config', async () => {
    const outputDir = await makeTempDir();
    const existingWebpack = () => undefined;
    const existingHeaders = async () => [
      {
        source: '/existing',
        headers: [{ key: 'X-Existing', value: 'yes' }],
      },
    ];
    const wrapped = withTastyNext({
      outputDir,
      publicPath: '/assets/tasty',
      config: {
        tokens: { '$brand-gap': '12px', '#brand': 'purple' },
        properties: {
          $rotation: {
            syntax: '<angle>',
            inherits: false,
            initialValue: '0deg',
          },
        },
        fontFaces: {
          Brand: {
            src: 'url("/fonts/brand.woff2") format("woff2")',
            fontDisplay: 'swap',
          },
        },
        counterStyles: {
          thumbs: { system: 'cyclic', symbols: '"👍"' },
        },
        functions: {
          $$double: { args: ['$value'], result: '($value * 2)' },
        },
        globalStyles: {
          body: { margin: '0', color: '#brand' },
        },
      },
    });

    const result = wrapped({
      basePath: '/docs',
      env: { EXISTING: 'yes' },
      headers: existingHeaders,
      webpack: existingWebpack,
    });
    const href = result.env?.TASTY_NEXT_SHARED_CSS_HREF;

    // Pin the full CSS byte stream: rule ordering and formatting feed the
    // content-addressed filename and must remain collector-compatible.
    expect(href).toBe('/docs/assets/tasty/tasty.shared.ef48a3e8fbfe.css');
    expect(result.env?.EXISTING).toBe('yes');
    expect(result.webpack).toBe(existingWebpack);
    expect(await result.headers!()).toEqual([
      {
        source: '/existing',
        headers: [{ key: 'X-Existing', value: 'yes' }],
      },
      {
        source: `/assets/tasty/${href!.split('/').at(-1)}`,
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]);

    const files = await readdir(outputDir);
    expect(files).toEqual([href!.split('/').at(-1)]);
    const css = await readFile(join(outputDir, files[0]), 'utf8');
    expect(css).toContain('@property --rotation');
    expect(css).toContain('--brand-gap: 12px');
    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Brand"');
    expect(css).toContain('@counter-style thumbs');
    expect(css).toContain('@function --double');
    expect(css).toContain('body');
    expect(css).toContain('margin: 0');

    // Build-time collection must not leave Tasty configured or locked in the
    // Next config process.
    expect(() => configure({ namePrefix: 'after-' })).not.toThrow();
  });

  it('includes plugin globals with direct configuration taking precedence', async () => {
    const outputDir = await makeTempDir();
    const result = withTastyNext({
      outputDir,
      publicPath: '/_tasty',
      config: {
        plugins: [
          {
            name: 'global-definitions',
            properties: {
              '$plugin-size': {
                syntax: '<length>',
                inherits: true,
                initialValue: '2px',
              },
            },
            tokens: { '$plugin-size': '3px' },
            fontFaces: {
              Plugin: { src: 'url("/fonts/plugin.woff2")' },
            },
            counterStyles: {
              plugin: { system: 'cyclic', symbols: '"P"' },
            },
            functions: {
              $$plugin: { args: ['$value'], result: '$value' },
            },
            globalStyles: {
              html: { padding: '$plugin-size' },
            },
          },
        ],
        tokens: { '$plugin-size': '5px' },
        globalStyles: {
          html: { color: 'red' },
        },
      },
    })({});
    const filename = result.env?.TASTY_NEXT_SHARED_CSS_HREF?.split('/').at(-1);
    const css = await readFile(join(outputDir, filename!), 'utf8');

    expect(css).toContain('@property --plugin-size');
    expect(css).toContain('--plugin-size: 5px');
    expect(css).toContain('font-family: "Plugin"');
    expect(css).toContain('@counter-style plugin');
    expect(css).toContain('@function --plugin');
    expect(css).toContain(
      'html { padding: var(--plugin-size); color: red; --current-color: red; }',
    );
  });

  it('loads a TypeScript config file', async () => {
    const root = await makeTempDir();
    const outputDir = 'public/generated/tasty';
    const configFile = join(root, 'tasty.config.ts');
    await writeFile(
      configFile,
      `export default { tokens: { '$from-file': '9px' } };`,
    );

    const result = withTastyNext({
      rootDir: root,
      configFile: './tasty.config.ts',
      outputDir,
    })({});
    const href = result.env?.TASTY_NEXT_SHARED_CSS_HREF;

    expect(href).toMatch(
      /^\/generated\/tasty\/tasty\.shared\.[a-f\d]{12}\.css$/,
    );
    const filename = href!.split('/').at(-1)!;
    expect(await readFile(join(root, outputDir, filename), 'utf8')).toContain(
      '--from-file: 9px',
    );
  });

  it('rejects an output directory outside public without publicPath', async () => {
    const outputDir = await makeTempDir();

    expect(() => withTastyNext({ config: {}, outputDir })({})).toThrow(
      '`publicPath` is required',
    );
  });

  it.each(['images/icon.svg', '../fonts/brand.woff2', '#document-filter'])(
    'rejects page-relative CSS URL %s',
    async (url) => {
      const outputDir = await makeTempDir();

      expect(() =>
        withTastyNext({
          outputDir,
          publicPath: '/_tasty',
          config: {
            fontFaces: { Brand: { src: `url("${url}")` } },
          },
        })({}),
      ).toThrow(`page-relative CSS URL "${url}"`);
    },
  );

  it('preserves older hashes for rolling deployments', async () => {
    const outputDir = await makeTempDir();
    await writeFile(join(outputDir, 'tasty.shared.000000000000.css'), 'stale');
    await writeFile(join(outputDir, 'keep.css'), 'keep');

    withTastyNext({
      outputDir,
      publicPath: '/_tasty',
      config: { tokens: { $version: '1px' } },
    })({});

    const files = (await readdir(outputDir)).sort();
    expect(files).toHaveLength(3);
    expect(files).toContain('keep.css');
    expect(files).toContain('tasty.shared.000000000000.css');
    expect(
      files.some((name) => /^tasty\.shared\.[a-f\d]{12}\.css$/.test(name)),
    ).toBe(true);
  });

  it('returns the original config unchanged when disabled', () => {
    const nextConfig = { env: { EXISTING: 'yes' } };

    expect(withTastyNext({ enabled: false })(nextConfig)).toBe(nextConfig);
  });

  it('does not add an unsupported headers hook to static exports', async () => {
    const outputDir = await makeTempDir();
    const result = withTastyNext({
      outputDir,
      publicPath: '/_tasty',
      config: {},
    })({ basePath: '', output: 'export' });

    expect(result.env?.TASTY_NEXT_SHARED_CSS_HREF).toMatch(
      /^\/_tasty\/tasty\.shared\.[a-f\d]{12}\.css$/,
    );
    expect(result.headers).toBeUndefined();
  });

  it('normalizes long trailing-slash suffixes in linear time', async () => {
    const outputDir = await makeTempDir();
    const result = withTastyNext({
      outputDir,
      publicPath: `/assets${'/'.repeat(100_000)}`,
      config: {},
    })({});

    expect(result.env?.TASTY_NEXT_SHARED_CSS_HREF).toMatch(
      /^\/assets\/tasty\.shared\.[a-f\d]{12}\.css$/,
    );
  });
});
