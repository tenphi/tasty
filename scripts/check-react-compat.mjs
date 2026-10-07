#!/usr/bin/env node
/** Test packed runtime and declarations against older React versions. Build first. */
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
const temp = mkdtempSync(join(tmpdir(), 'tasty-react-compat-'));
// Packing uses repository tooling; consumer checks may use an older Node binary.
const consumerNode = process.env.TASTY_REACT_COMPAT_NODE || process.execPath;

try {
  const tarball = join(temp, 'tasty.tgz');
  execFileSync('pnpm', ['pack', '--out', tarball], {
    cwd: root,
    stdio: 'pipe',
  });

  for (const [version, typesVersion] of [
    ['18.3.1', '18.3.0'],
    ['19.1.1', '19.0.0'],
  ]) {
    const cwd = join(temp, version);
    mkdirSync(cwd);
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    copyFileSync(
      new URL('./react-compat/smoke.mjs', import.meta.url),
      join(cwd, 'smoke.mjs'),
    );
    copyFileSync(
      new URL('./react-compat/types.tsx', import.meta.url),
      join(cwd, 'types.tsx'),
    );
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
        tarball,
        `react@${version}`,
        `react-dom@${version}`,
        `@types/react@${typesVersion}`,
        `@types/react-dom@${typesVersion}`,
        '@types/node@20.19.0',
        'typescript@5.4.5',
      ],
      { cwd, stdio: 'pipe', timeout: 120_000 },
    );

    console.log(
      `Checking packed declarations with React types ${typesVersion}`,
    );
    execFileSync(
      consumerNode,
      [
        join(cwd, 'node_modules/typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        // Validate consumer expressions. Generated declaration internals have
        // existing errors on main, independently of this dependency upgrade.
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'ESNext',
        '--moduleResolution',
        'Bundler',
        '--jsx',
        'react-jsx',
        'types.tsx',
      ],
      { cwd, stdio: 'inherit' },
    );

    for (const mode of ['development', 'production']) {
      console.log(`Testing packed Tasty with React ${version} (${mode})`);
      execFileSync(consumerNode, ['smoke.mjs'], {
        cwd,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: mode,
          EXPECTED_REACT_VERSION: version,
        },
      });
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
