import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const outputs: string[] = [];
const REPO_ROOT = resolve(__dirname, '../..');
const FIXTURE = resolve(__dirname, 'fixtures/astro-extraction');
const FIXTURE_CACHE = resolve(FIXTURE, '.astro');
const FIXTURE_MODULE_CACHE = resolve(FIXTURE, 'node_modules');
const ASTRO_BIN = resolve(REPO_ROOT, 'node_modules/astro/astro.js');

afterEach(async () => {
  await Promise.all([
    ...outputs.splice(0).map((path) => rm(path, { recursive: true })),
    rm(FIXTURE_CACHE, { recursive: true, force: true }),
    rm(FIXTURE_MODULE_CACHE, { recursive: true, force: true }),
  ]);
});

describe('Astro production extraction fixture', () => {
  it('extracts shared CSS and ships no client Tasty runtime', async () => {
    const output = await mkdtemp(joinTempPath());
    outputs.push(output);

    await execFileAsync(process.execPath, [
      ASTRO_BIN,
      'build',
      '--root',
      FIXTURE,
      '--outDir',
      output,
    ]);

    const index = await readFile(resolve(output, 'index.html'), 'utf8');
    const about = await readFile(resolve(output, 'about/index.html'), 'utf8');
    const assets = await readdir(resolve(output, '_astro'));
    const tastyAsset = assets.find((name) =>
      /^tasty\.[a-f0-9]+\.css$/.test(name),
    );

    expect(tastyAsset).toBeDefined();
    expect(index).toContain(`href="/_astro/${tastyAsset}"`);
    expect(about).toContain(`href="/_astro/${tastyAsset}"`);
    expect(index).not.toContain('data-tasty-extract');
    expect(about).not.toContain('data-tasty-extract');
    expect(index).not.toContain('<script');
    expect(about).not.toContain('<script');

    const css = await readFile(resolve(output, '_astro', tastyAsset!), 'utf8');
    for (const expected of [
      '@property --extract-size',
      '@font-face',
      '@counter-style extract-counter',
      '@function --extract-double',
      '.extract-raw',
      '.extract-global',
      'display: block',
      '@keyframes extract-fade',
    ]) {
      expect(css).toContain(expected);
    }
    expect(css).not.toContain('page-only-fade');
    expect(index).toContain('page-only-fade');
    expect(about).not.toContain('page-only-fade');
    expect(about).not.toContain('<style data-tasty-ssr');
  }, 30_000);
});

function joinTempPath(): string {
  return resolve(tmpdir(), 'tasty-astro-production-');
}
