import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { transformSync } from '@babel/core';

/**
 * `jiti` is an optional peer, needed only for `configFile`. Mocking it to fail
 * on import stands in for a project that never installed it: a static import
 * anywhere in these entries makes the dynamic imports below reject. The
 * on-demand load goes through Node's own `require`, which the mock does not
 * reach, so `configFile` keeps working against the real package.
 */
vi.mock('jiti', () => {
  throw new Error('Cannot find package "jiti"');
});

const SOURCE = `
import { tastyStatic } from '@tenphi/tasty/static';

const card = tastyStatic({ display: 'block' });
`;

// The Babel plugin and the Next.js wrappers are imported here for the first
// time; under a full parallel run that transform alone can take most of the
// default 5s timeout.
describe('optional jiti peer', { timeout: 30_000 }, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tasty-jiti-test-'));
  });

  afterEach(async () => {
    const { clearWriterCache } = await import('./writer-cache');
    clearWriterCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads the Babel plugin and the Next.js wrappers without it', async () => {
    await expect(import('./babel')).resolves.toHaveProperty('default');
    await expect(import('./next')).resolves.toHaveProperty('withTastyZero');
    await expect(import('../ssr/next-config')).resolves.toHaveProperty(
      'withTastyNext',
    );
  });

  it('transforms with an inline config without loading it', async () => {
    const { default: babelPlugin } = await import('./babel');
    const output = path.join(tempDir, 'out.css');

    transformSync(SOURCE, {
      filename: path.join(tempDir, 'card.tsx'),
      plugins: [[babelPlugin, { output, config: { tokens: { $gap: '8px' } } }]],
      babelrc: false,
      configFile: false,
    });

    expect(fs.readFileSync(output, 'utf8')).toContain('display: block');
  });

  it('loads a configFile through jiti on demand', async () => {
    const { default: babelPlugin } = await import('./babel');
    const output = path.join(tempDir, 'out.css');
    const configFile = path.join(tempDir, 'tasty.config.ts');
    fs.writeFileSync(
      configFile,
      `export default { tokens: { '$card-gap': '12px' } as const };\n`,
    );

    transformSync(SOURCE, {
      filename: path.join(tempDir, 'card.tsx'),
      plugins: [[babelPlugin, { output, configFile }]],
      babelrc: false,
      configFile: false,
    });

    expect(fs.readFileSync(output, 'utf8')).toContain('--card-gap: 12px');
  });
});
