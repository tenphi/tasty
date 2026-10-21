#!/usr/bin/env node
/** Test the packed Babel plugin and its declarations against each supported Babel major. Build first. */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'tasty-babel-compat-'));

// The oldest Babel 7 the peer range allows, the last Babel 7, and Babel 8.
// Babel 7 publishes its types separately, so its checks install them too.
const BABEL_VERSIONS = [
  {
    core: '7.24.0',
    types: '7.24.0',
    pluginUtils: '7.24.0',
    typings: ['@types/babel__core@7.20.5'],
  },
  {
    core: '7.29.7',
    types: '7.29.8',
    pluginUtils: '7.29.7',
    typings: ['@types/babel__core@7.20.5'],
  },
  { core: '8.0.6', types: '8.0.6', pluginUtils: '8.0.1', typings: [] },
];

try {
  const tarball = join(temp, 'tasty.tgz');
  execFileSync('pnpm', ['pack', '--out', tarball], {
    cwd: root,
    stdio: 'pipe',
  });

  for (const { core, types, pluginUtils, typings } of BABEL_VERSIONS) {
    const cwd = join(temp, core);
    mkdirSync(cwd);
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    for (const file of ['smoke.mjs', 'types.ts']) {
      copyFileSync(
        new URL(`./babel-compat/${file}`, import.meta.url),
        join(cwd, file),
      );
    }
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        tarball,
        `@babel/core@${core}`,
        `@babel/types@${types}`,
        `@babel/helper-plugin-utils@${pluginUtils}`,
        ...typings,
        '@types/node@20.19.0',
        'typescript@5.4.5',
      ],
      { cwd, stdio: 'pipe', timeout: 120_000 },
    );

    console.log(`Checking packed declarations with Babel ${core} types`);
    execFileSync(
      process.execPath,
      [
        join(cwd, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        'types.ts',
      ],
      { cwd, stdio: 'inherit' },
    );

    console.log(`Testing the packed Babel plugin with Babel ${core}`);
    execFileSync(process.execPath, ['smoke.mjs'], {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, EXPECTED_BABEL_VERSION: core },
    });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
