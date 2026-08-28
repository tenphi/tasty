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
  config: {
    base?: string;
    site?: URL;
    build?: {
      assets?: string;
      assetsPrefix?: string | Record<string, string>;
    };
  } = {},
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

function assetName(page: string, scope: 'shared' | 'page'): string {
  const match = page.match(
    new RegExp(`href="[^"]+/(tasty\\.${scope}\\.[a-f0-9]+\\.css)"`),
  );
  expect(match).not.toBeNull();
  return match![1];
}

function assetNames(page: string): string[] {
  return [
    ...page.matchAll(/href="[^"]+\/(tasty\.(?:shared|page)\.[a-f0-9]+\.css)"/g),
  ].map((match) => match[1]);
}

describe('Astro build-wide CSS extraction', () => {
  it('extracts every collector artifact kind and preserves the CSP nonce', async () => {
    const shared = [
      artifact(
        'property:shared',
        'property',
        '@property --size { syntax: "<length>"; inherits: false; initial-value: 0px; }',
        0,
      ),
      artifact(
        'font-face:shared',
        'font-face',
        '@font-face { font-family: Shared; src: local("Arial"); }',
        1,
      ),
      artifact(
        'counter-style:shared',
        'counter-style',
        '@counter-style shared { system: cyclic; symbols: "•"; }',
        2,
      ),
      artifact(
        'function:shared',
        'function',
        '@function --double(--value <number>) { result: calc(var(--value) * 2); }',
        3,
      ),
      artifact('raw:shared', 'raw', '.raw { --shared: 1; }', 4),
      artifact('global:shared', 'global', 'body { margin: 0; }', 5),
      artifact('chunk:shared', 'chunk', '.shared { display: block; }', 6),
      artifact(
        'keyframes:shared',
        'keyframes',
        '@keyframes shared { to { opacity: .5; } }',
        7,
      ),
    ];
    const root = await makeOutput({
      'index.html': html(shared, 'abc'),
      'about.html': html(shared, 'abc'),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    expect(await read(root, `_astro/${assetName(index, 'shared')}`)).toBe(
      shared.map(({ css }) => css).join('\n'),
    );
    expect(assetNames(index)).toEqual([assetName(index, 'shared')]);
    expect(index).toContain('data-tasty-ssr nonce="abc"');
    expect(index).not.toContain('<style data-tasty-ssr');
    expect(index.match(/<link rel="stylesheet"/g)).toHaveLength(1);
  });

  it.each(['images/icon.svg', '../fonts/brand.woff2', '#document-filter'])(
    'rejects page-relative extracted CSS URL %s',
    async (url) => {
      const item = artifact(
        'raw:relative-url',
        'raw',
        `.icon { background-image: url("${url}"); }`,
        0,
      );
      const original = html([item]);
      const root = await makeOutput({ 'index.html': original });

      await expect(
        runBuild(root, { css: { mode: 'extract' } }),
      ).rejects.toThrow(`page-relative CSS URL "${url}"`);
      expect(await read(root, 'index.html')).toBe(original);
    },
  );

  it.each([
    [
      'image-set string',
      '.icon { background-image: image-set("images/icon.png" 1x); }',
      'images/icon.png',
    ],
    [
      'vendor image-set string',
      '.icon { background-image: -webkit-image-set("../icon.png" 1x); }',
      '../icon.png',
    ],
    [
      'image function string',
      '.icon { background-image: image("./fallback.png"); }',
      './fallback.png',
    ],
    [
      'src function string',
      '@font-face { src: src("fonts/brand.woff2"); }',
      'fonts/brand.woff2',
    ],
    ['import string', '@import "theme.css";', 'theme.css'],
    [
      'escaped url function',
      String.raw`.icon { background-image: u\72l(images/icon.png); }`,
      'images/icon.png',
    ],
    [
      'escaped relative URL value',
      String.raw`.icon { background-image: url(\2e /images/icon.png); }`,
      String.raw`\2e /images/icon.png`,
    ],
  ])('rejects a page-relative %s', async (_label, css, url) => {
    const item = artifact('raw:relative-resource', 'raw', css, 0);
    const original = html([item]);
    const root = await makeOutput({ 'index.html': original });

    await expect(runBuild(root, { css: { mode: 'extract' } })).rejects.toThrow(
      `page-relative CSS URL "${url}"`,
    );
    expect(await read(root, 'index.html')).toBe(original);
  });

  it.each([
    ['string', 'https://cdn.example.com'],
    [
      'CSS map',
      {
        css: 'https://css.example.com',
        fallback: 'https://cdn.example.com',
      },
    ],
    ['fallback map', { fallback: '//cdn.example.com' }],
  ] as const)(
    'rejects root-relative CSS URLs with an external %s assetsPrefix',
    async (_label, assetsPrefix) => {
      const item = artifact(
        'raw:root-relative-url',
        'raw',
        '.icon { background-image: url(/images/icon.svg); }',
        0,
      );
      const original = html([item]);
      const root = await makeOutput({ 'index.html': original });

      await expect(
        runBuild(
          root,
          { css: { mode: 'extract' } },
          { build: { assetsPrefix } },
        ),
      ).rejects.toThrow(
        'root-relative CSS URL "/images/icon.svg" would resolve against the external assetsPrefix',
      );
      expect(await read(root, 'index.html')).toBe(original);
    },
  );

  it('allows root-relative URLs with a same-origin assetsPrefix path', async () => {
    const item = artifact(
      'raw:root-relative-url',
      'raw',
      '.icon { background-image: image-set("/images/icon.svg" 1x); }',
      0,
    );
    const root = await makeOutput({ 'index.html': html([item]) });

    await runBuild(
      root,
      { css: { mode: 'extract' } },
      { build: { assetsPrefix: '/cdn' } },
    );

    const index = await read(root, 'index.html');
    expect(index).toContain('href="/cdn/_astro/');
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      item.css,
    );
  });

  it('allows root-relative URLs with a configured same-origin absolute assetsPrefix', async () => {
    const item = artifact(
      'raw:root-relative-url',
      'raw',
      '.icon { background-image: url(/images/icon.svg); }',
      0,
    );
    const root = await makeOutput({ 'index.html': html([item]) });

    await runBuild(
      root,
      { css: { mode: 'extract' } },
      {
        site: new URL('https://site.example.com'),
        build: { assetsPrefix: 'https://site.example.com/static' },
      },
    );

    const index = await read(root, 'index.html');
    expect(index).toContain('href="https://site.example.com/static/_astro/');
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      item.css,
    );
  });

  it('accepts location-independent CSS URLs without matching comments or strings', async () => {
    const item = artifact(
      'raw:safe-urls',
      'raw',
      [
        '.root { background: url(/images/root.png); }',
        '.absolute { background: url("https://cdn.example.com/image.png"); }',
        '.protocol-relative { background: url(//cdn.example.com/image.png); }',
        '.data { background: url(data:image/png;base64,AA==); }',
        '.set { background: image-set("https://cdn.example.com/a.png" 1x); }',
        '.typed-set { background: image-set(url(/a.png) type("image/png") 1x); }',
        '@import url("https://cdn.example.com/theme.css");',
        '/* url(comment-relative.png) */',
        '.label::before { content: "url(string-relative.png)"; }',
      ].join('\n'),
      0,
    );
    const root = await makeOutput({ 'index.html': html([item]) });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      item.css,
    );
  });

  it('splits shared and page-only artifacts of every collector kind', async () => {
    const shared = [
      artifact(
        'property:shared',
        'property',
        '@property --shared { syntax: "<number>"; }',
        0,
      ),
      artifact(
        'font-face:shared',
        'font-face',
        '@font-face { font-family: Shared; src: url(/fonts/shared.woff2); }',
        1,
      ),
      artifact(
        'counter-style:shared',
        'counter-style',
        '@counter-style shared { system: cyclic; symbols: "s"; }',
        2,
      ),
      artifact(
        'function:shared',
        'function',
        '@function --shared() { result: 1; }',
        3,
      ),
      artifact('raw:shared', 'raw', '.raw-shared { --x: 1; }', 4),
      artifact(
        'global:shared',
        'global',
        '.global-shared { color: green; }',
        5,
      ),
      artifact('chunk:shared', 'chunk', '.chunk-shared { display: block; }', 6),
      artifact(
        'keyframes:shared',
        'keyframes',
        '@keyframes shared { to { opacity: .5; } }',
        7,
      ),
    ];
    const unique = (marker: string) => [
      artifact(
        `property:${marker}`,
        'property',
        `@property --${marker} { syntax: "<number>"; }`,
        0,
      ),
      artifact(
        `font-face:${marker}`,
        'font-face',
        `@font-face { font-family: ${marker}; src: url(/fonts/${marker}.woff2); }`,
        1,
      ),
      artifact(
        `counter-style:${marker}`,
        'counter-style',
        `@counter-style ${marker} { system: cyclic; symbols: "${marker}"; }`,
        2,
      ),
      artifact(
        `function:${marker}`,
        'function',
        `@function --${marker}() { result: ${marker}; }`,
        3,
      ),
      artifact(`raw:${marker}`, 'raw', `.raw-${marker} { --x: 1; }`, 4),
      artifact(
        `global:${marker}`,
        'global',
        `.global-${marker} { color: ${marker}; }`,
        5,
      ),
      artifact(
        `chunk:${marker}`,
        'chunk',
        `.chunk-${marker} { display: grid; }`,
        6,
      ),
      artifact(
        `keyframes:${marker}`,
        'keyframes',
        `@keyframes ${marker} { to { opacity: .5; } }`,
        7,
      ),
    ];
    const pageArtifacts = (marker: string) => {
      const pageOnly = unique(marker);
      return shared.flatMap((item, index) => [
        { ...item, order: index * 2 },
        { ...pageOnly[index], order: index * 2 + 1 },
      ]);
    };
    const root = await makeOutput({
      'index.html': html(pageArtifacts('crimson'), 'abc'),
      'about.html': html(pageArtifacts('navy'), 'abc'),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about.html');
    expect(await read(root, `_astro/${assetName(index, 'shared')}`)).toBe(
      shared.map(({ css }) => css).join('\n'),
    );
    const indexPageCSS = await read(root, `_astro/${assetName(index, 'page')}`);
    const aboutPageCSS = await read(root, `_astro/${assetName(about, 'page')}`);
    expect(indexPageCSS).toBe(
      unique('crimson')
        .map(({ css }) => css)
        .join('\n'),
    );
    expect(aboutPageCSS).toBe(
      unique('navy')
        .map(({ css }) => css)
        .join('\n'),
    );
    expect(index).not.toContain('crimson');
    expect(index).not.toContain('navy');
    expect(about).not.toContain('navy');
    expect(about).not.toContain('crimson');
    expect(index).not.toContain('<style data-tasty-ssr');
    expect(index.match(/<link rel="stylesheet"/g)).toHaveLength(2);
    expect(index.match(/data-tasty-ssr nonce="abc"/g)).toHaveLength(2);
  });

  it('extracts shared and page-only component CSS into ordered assets', async () => {
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
    const filename = assetName(index, 'shared');
    expect(assetName(about, 'shared')).toBe(filename);
    expect(await read(root, `_astro/${filename}`)).toBe(common.css);
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      one.css,
    );
    expect(await read(root, `_astro/${assetName(about, 'page')}`)).toBe(
      two.css,
    );
    expect(index).not.toContain(common.css);
    expect(about).not.toContain(common.css);
    expect(index).not.toContain(one.css);
    expect(index).not.toContain(two.css);
    expect(about).not.toContain(two.css);
    expect(about).not.toContain(one.css);
    expect(assetNames(index)).toEqual([
      assetName(index, 'shared'),
      assetName(index, 'page'),
    ]);
    expect(index).not.toContain('data-tasty-extract');
  });

  it('uses shared CSS as the base cascade and page CSS as the override', async () => {
    const common = artifact(
      'global:common',
      'global',
      '.cascade-probe{color:blue}',
      1,
    );
    const home = artifact(
      'global:home',
      'global',
      '.cascade-probe{color:red}',
      0,
    );
    const aboutOnly = artifact(
      'global:about',
      'global',
      '.cascade-probe{color:green}',
      0,
    );
    const root = await makeOutput({
      'index.html': html([home, common]),
      'about.html': html([aboutOnly, common]),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about.html');
    expect(await read(root, `_astro/${assetName(index, 'shared')}`)).toBe(
      common.css,
    );
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      home.css,
    );
    expect(await read(root, `_astro/${assetName(about, 'page')}`)).toBe(
      aboutOnly.css,
    );
    expect(assetNames(index)).toEqual([
      assetName(index, 'shared'),
      assetName(index, 'page'),
    ]);
  });

  it('extracts common artifacts even after page artifacts diverge', async () => {
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
      'about.html': html(
        [rawTwo, { ...common, order: 1 }, { ...globalTwo, order: 2 }],
        'abc',
      ),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about.html');
    const sharedCSS = await read(root, `_astro/${assetName(index, 'shared')}`);
    const indexCSS = await read(root, `_astro/${assetName(index, 'page')}`);
    const aboutCSS = await read(root, `_astro/${assetName(about, 'page')}`);
    expect(sharedCSS).toBe(common.css);
    expect(indexCSS).toBe([rawOne.css, globalOne.css].join('\n'));
    expect(aboutCSS).toBe([rawTwo.css, globalTwo.css].join('\n'));
    expect(assetNames(index)).toEqual([
      assetName(index, 'shared'),
      assetName(index, 'page'),
    ]);
    expect(assetNames(about)).toEqual([
      assetName(about, 'shared'),
      assetName(about, 'page'),
    ]);
    expect(index).not.toContain('<style data-tasty-ssr');
    expect(index).toContain('data-tasty-ssr nonce="abc"');
  });

  it('writes only page stylesheets when styled pages share no artifacts', async () => {
    const home = artifact('chunk:home', 'chunk', '.home{display:block}', 0);
    const aboutOnly = artifact(
      'chunk:about',
      'chunk',
      '.about{display:grid}',
      0,
    );
    const root = await makeOutput({
      'index.html': html([home]),
      'about.html': html([aboutOnly]),
    });

    await runBuild(root, { css: { mode: 'extract' } });

    const index = await read(root, 'index.html');
    const about = await read(root, 'about.html');
    expect(assetNames(index)).toEqual([assetName(index, 'page')]);
    expect(assetNames(about)).toEqual([assetName(about, 'page')]);
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      home.css,
    );
    expect(await read(root, `_astro/${assetName(about, 'page')}`)).toBe(
      aboutOnly.css,
    );
  });

  it('uses the configured base and asset directory for nested routes', async () => {
    const common = artifact(
      'chunk:common',
      'chunk',
      '.common{padding:1rem}',
      0,
    );
    const root = await makeOutput({
      'index.html': html([
        common,
        artifact('chunk:home', 'chunk', '.home{display:block}', 1),
      ]),
      'guides/start/index.html': html([
        common,
        artifact('chunk:guide', 'chunk', '.guide{display:grid}', 1),
      ]),
    });

    await runBuild(
      root,
      { css: { mode: 'extract' } },
      { base: '/docs/', build: { assets: 'assets' } },
    );

    const nested = await read(root, 'guides/start/index.html');
    expect(nested).toContain(
      'href="/docs/assets/' + assetName(nested, 'shared') + '"',
    );
    expect(nested).toContain(
      'href="/docs/assets/' + assetName(nested, 'page') + '"',
    );
    expect(await read(root, `assets/${assetName(nested, 'shared')}`)).toBe(
      common.css,
    );
    expect(await read(root, `assets/${assetName(nested, 'page')}`)).toBe(
      '.guide{display:grid}',
    );
  });

  it.each([
    ['string', 'https://cdn.example.com', 'https://cdn.example.com'],
    [
      'extension map',
      {
        css: 'https://css.example.com/',
        fallback: 'https://cdn.example.com',
      },
      'https://css.example.com',
    ],
    [
      'fallback map',
      { fallback: 'https://fallback.example.com/' },
      'https://fallback.example.com',
    ],
  ] as const)(
    'uses an Astro %s assetsPrefix for both extracted stylesheets',
    async (_label, assetsPrefix, expectedPrefix) => {
      const common = artifact(
        'chunk:common',
        'chunk',
        '.common{padding:1rem}',
        0,
      );
      const root = await makeOutput({
        'index.html': html([
          common,
          artifact('chunk:home', 'chunk', '.home{display:block}', 1),
        ]),
        'about.html': html([
          common,
          artifact('chunk:about', 'chunk', '.about{display:grid}', 1),
        ]),
      });

      await runBuild(
        root,
        { css: { mode: 'extract' } },
        {
          base: '/docs/',
          build: { assets: 'assets', assetsPrefix },
        },
      );

      const index = await read(root, 'index.html');
      expect(index).toContain(
        `href="${expectedPrefix}/assets/${assetName(index, 'shared')}"`,
      );
      expect(index).toContain(
        `href="${expectedPrefix}/assets/${assetName(index, 'page')}"`,
      );
      expect(index).not.toContain('href="/docs/assets/');
    },
  );

  it('emits deterministic shared and page assets across builds', async () => {
    const common = artifact('chunk:common', 'chunk', '.common{gap:1rem}', 0);
    const local = artifact('chunk:local', 'chunk', '.local{margin:1rem}', 1);
    const first = await makeOutput({
      'index.html': html([common, local]),
      'about.html': html([common]),
    });
    const second = await makeOutput({
      'index.html': html([common, local]),
      'about.html': html([common]),
    });
    const changedSharedArtifact = artifact(
      'chunk:changed',
      'chunk',
      '.common{gap:2rem}',
      0,
    );
    const changedShared = await makeOutput({
      'index.html': html([changedSharedArtifact, local]),
      'about.html': html([changedSharedArtifact]),
    });
    const changedLocal = artifact(
      'chunk:local-changed',
      'chunk',
      '.local{margin:2rem}',
      1,
    );
    const changedPage = await makeOutput({
      'index.html': html([common, changedLocal]),
      'about.html': html([common]),
    });

    await runBuild(first, { css: { mode: 'extract' } });
    await runBuild(second, { css: { mode: 'extract' } });
    await runBuild(changedShared, { css: { mode: 'extract' } });
    await runBuild(changedPage, { css: { mode: 'extract' } });
    const firstPage = await read(first, 'index.html');
    const secondPage = await read(second, 'index.html');
    const changedSharedPage = await read(changedShared, 'index.html');
    const changedPagePage = await read(changedPage, 'index.html');
    expect(assetName(firstPage, 'shared')).toBe(
      assetName(secondPage, 'shared'),
    );
    expect(assetName(firstPage, 'shared')).not.toBe(
      assetName(changedSharedPage, 'shared'),
    );
    expect(assetName(firstPage, 'shared')).toBe(
      assetName(changedPagePage, 'shared'),
    );
    expect(assetName(firstPage, 'page')).toBe(assetName(secondPage, 'page'));
    expect(assetName(firstPage, 'page')).toBe(
      assetName(changedSharedPage, 'page'),
    );
    expect(assetName(firstPage, 'page')).not.toBe(
      assetName(changedPagePage, 'page'),
    );
    expect(await read(first, `_astro/${assetName(firstPage, 'shared')}`)).toBe(
      await read(second, `_astro/${assetName(secondPage, 'shared')}`),
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

    const index = await read(root, 'index.html');
    expect(await read(root, 'plain/index.html')).toBe(plain);
    expect(assetNames(index)).toEqual([assetName(index, 'page')]);
    expect(await read(root, `_astro/${assetName(index, 'page')}`)).toBe(
      common.css,
    );
    expect(index).not.toContain('<style data-tasty-ssr');
  });

  it('keeps inline mode unchanged when css.mode is omitted', async () => {
    const common = artifact('chunk:common', 'chunk', '.common{margin:0}', 0);
    const original = html([common]);
    const root = await makeOutput({ 'index.html': original });

    await runBuild(root, { islands: false });

    expect(await read(root, 'index.html')).toBe(original);
  });
});
