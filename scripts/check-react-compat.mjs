#!/usr/bin/env node
/** Test the packed package against real supported React versions. Build first. */
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

try {
  const tarball = join(temp, 'tasty.tgz');
  execFileSync('pnpm', ['pack', '--out', tarball], {
    cwd: root,
    stdio: 'pipe',
  });

  for (const version of ['18.3.1', '19.1.1']) {
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
      ],
      { cwd, stdio: 'pipe', timeout: 120_000 },
    );

    for (const mode of ['development', 'production']) {
      console.log(`Testing packed Tasty with React ${version} (${mode})`);
      execFileSync(process.execPath, ['smoke.mjs'], {
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
