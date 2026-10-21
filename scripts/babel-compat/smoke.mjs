import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { transformAsync, version } from '@babel/core';

assert.equal(version, process.env.EXPECTED_BABEL_VERSION);

const source = `
import { tastyStatic } from '@tenphi/tasty/static';

const layer = tastyStatic({ display: 'block', zIndex: -1 });
tastyStatic('.page', { padding: '16px' });
`;

async function transform(options) {
  const result = await transformAsync(source, {
    filename: join(process.cwd(), 'page.js'),
    plugins: [['@tenphi/tasty/babel-plugin', options]],
    babelrc: false,
    configFile: false,
  });

  return result.code;
}

const injected = await transform({ mode: 'inject' });
assert.match(injected, /from ['"]@tenphi\/tasty\/static\/inject['"]/);
assert.match(injected, /className: ['"]ts[a-z0-9]+/);
assert.match(injected, /zIndex: -1/);
assert.match(injected, /\.page/);

const outputDir = mkdtempSync(join(tmpdir(), 'tasty-babel-smoke-'));

try {
  const output = join(outputDir, 'tasty.css');
  const written = await transform({ output });
  assert.match(written, /tasty\.css['"]/);

  const css = readFileSync(output, 'utf8');
  assert.match(css, /display:\s*block/);
  assert.match(css, /\.page\s*\{[^}]*padding:\s*16px/);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
