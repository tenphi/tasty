import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createExtractionMetadata } from './astro-extraction';
import { tastyIntegration } from './astro';
import type { ServerStyleArtifact, ServerStyleArtifactKind } from './collector';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

function artifact(
  id: string,
  kind: ServerStyleArtifactKind,
  css: string,
  order: number,
): ServerStyleArtifact {
  return { id, kind, css, order };
}

function html(artifacts: ServerStyleArtifact[], nonce?: string): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  const css = artifacts.map(({ css }) => css).join('\n');
  return `<html><head><style data-tasty-ssr${nonceAttr}>${css}</style>${createExtractionMetadata(artifacts)}</head><body></body></html>`;
}

async function makeOutput(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tasty-astro-extract-'));
  tempDirs.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

async function runBuild(
  root: string,
  options: Parameters<typeof tastyIntegration>[0],
  config: { base?: string; build?: { assets?: string } } = {},
): Promise<void> {
  const integration = tastyIntegration(options);
  const configDone = integration.hooks['astro:config:done'];
  const buildDone = integration.hooks['astro:build:done'];
  configDone({ config });
  await buildDone({ dir: pathToFileURL(`${root}/`) });
}

async function read(root: string, path: string): Promise<string> {
  return readFile(join(root, path), 'utf8');
}

function assetName(page: string): string {
  const match = page.match(/href="[^"]+\/(tasty\.[a-f0-9]+\.css)"/);
  expect(match).not.toBeNull();
  return match![1];
}

describe('Astro build-wide CSS extraction', () => {
  it('extracts a shared block and keeps page-only component CSS local', async () => {
    const common = artifact('chunk:common', 'chunk', '.common{color:red}', 0);
    const one = artifact('chunk:one', 'chunk', '.one{display:block}', 1);
    const two = artifact('chunk:two', 'chunk', '.two{display:grid}', 1);
    const root = await makeOutput({
      'index.html': html([common, one]),
      'about/index.html': html([common, two]),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about/index.html');
    const filename = assetName(index);
    expect(assetName(about)).toBe(filename);
    expect(await read(root, `_astro/${filename}`)).toBe(common.css);
    expect(index).not.toContain(common.css);
    expect(about).not.toContain(common.css);
    expect(index).toContain(one.css);
    expect(index).not.toContain(two.css);
    expect(about).toContain(two.css);
    expect(about).not.toContain(one.css);
    expect(index).not.toContain('data-tasty-extract');
  });

  it('preserves multiline raw CSS and conflicting globals page-locally', async () => {
    const rawOne = artifact(
      'raw:one',
      'raw',
      '.raw {\n  content: "one";\n}',
      0,
    );
    const rawTwo = artifact(
      'raw:two',
      'raw',
      '.raw {\n  content: "two";\n}',
      0,
    );
    const globalOne = artifact('global:one', 'global', 'body{color:red}', 1);
    const globalTwo = artifact('global:two', 'global', 'body{color:blue}', 1);
    const common = artifact('chunk:common', 'chunk', '.common{margin:0}', 2);
    const root = await makeOutput({
      'index.html': html([rawOne, globalOne, common], 'abc'),
      'about.html': html([rawTwo, globalTwo, common], 'abc'),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about.html');
    expect(index).toContain(rawOne.css);
    expect(index).toContain(globalOne.css);
    expect(index).not.toContain(rawTwo.css);
    expect(about).toContain(rawTwo.css);
    expect(about).toContain(globalTwo.css);
    expect(index).toContain('<style data-tasty-ssr nonce="abc">');
    expect(index.indexOf('</style>')).toBeLessThan(index.indexOf('<link'));
  });

  it('uses the configured base and asset directory for nested routes', async () => {
    const common = artifact(
      'chunk:common',
      'chunk',
      '.common{padding:1rem}',
      0,
    );
    const root = await makeOutput({
      'index.html': html([common]),
      'guides/start/index.html': html([common]),
    });

    await runBuild(
      root,
      { css: { mode: 'extract' } },
      { base: '/docs/', build: { assets: 'assets' } },
    );

    const nested = await read(root, 'guides/start/index.html');
    expect(nested).toContain('href="/docs/assets/' + assetName(nested) + '"');
    expect(await read(root, `assets/${assetName(nested)}`)).toBe(common.css);
  });

  it('emits deterministic asset names and content across builds', async () => {
    const common = artifact('chunk:common', 'chunk', '.common{gap:1rem}', 0);
    const first = await makeOutput({
      'index.html': html([common]),
      'about.html': html([common]),
    });
    const second = await makeOutput({
      'index.html': html([common]),
      'about.html': html([common]),
    });
    const changedArtifact = artifact(
      'chunk:changed',
      'chunk',
      '.common{gap:2rem}',
      0,
    );
    const changed = await makeOutput({
      'index.html': html([changedArtifact]),
      'about.html': html([changedArtifact]),
    });

    await runBuild(first, { css: { mode: 'extract' } });
    await runBuild(second, { css: { mode: 'extract' } });
    await runBuild(changed, { css: { mode: 'extract' } });
    const firstPage = await read(first, 'index.html');
    const secondPage = await read(second, 'index.html');
    const changedPage = await read(changed, 'index.html');
    expect(assetName(firstPage)).toBe(assetName(secondPage));
    expect(assetName(firstPage)).not.toBe(assetName(changedPage));
    expect(await read(first, `_astro/${assetName(firstPage)}`)).toBe(
      await read(second, `_astro/${assetName(secondPage)}`),
    );
  });

  it('leaves pages without Tasty metadata unchanged', async () => {
    const plain = '<html><head></head><body>plain</body></html>';
    const common = artifact('chunk:common', 'chunk', '.common{margin:0}', 0);
    const root = await makeOutput({
      'index.html': html([common]),
      'plain/index.html': plain,
    });

    await runBuild(root, { css: { mode: 'extract' } });

    expect(await read(root, 'plain/index.html')).toBe(plain);
  });

  it('keeps inline mode unchanged when css.mode is omitted', async () => {
    const common = artifact('chunk:common', 'chunk', '.common{margin:0}', 0);
    const original = html([common]);
    const root = await makeOutput({ 'index.html': original });

    await runBuild(root, { islands: false });

    expect(await read(root, 'index.html')).toBe(original);
  });
});
