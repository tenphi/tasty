#!/usr/bin/env node
/**
 * Smoke-test the emitted package graph rather than the source graph.
 *
 * Manual chunking can turn a harmless source-level cycle into an ESM temporal
 * dead zone. Unit tests import source modules, so only loading the built entry
 * points catches that class of packaging failure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// `ssr/next.js` is the sole exception: loading it directly requires the
// framework-owned `next/navigation` peer that is intentionally not installed.
const entries = [
  'index.js',
  'core/index.js',
  'static/index.js',
  'static/inject.js',
  'zero/index.js',
  'zero/babel.js',
  'zero/next.js',
  'ssr/index.js',
  'ssr/next-config.js',
  'ssr/astro.js',
  'ssr/astro-client.js',
  'ssr/astro-middleware.js',
  'ssr/astro-middleware-static.js',
  'ssr/astro-middleware-extract.js',
  'ssr/astro-middleware-extract-static.js',
];

const expectedChunks = [
  'debug-',
  'dsl-',
  'react-runtime-',
  'runtime-engine-',
  'style-engine-',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

for (const entry of entries) {
  await import(new URL(`../dist/${entry}`, import.meta.url));
}

const chunkFiles = readdirSync(join(distDir, 'chunks'));
for (const prefix of expectedChunks) {
  if (
    !chunkFiles.some((file) => file.startsWith(prefix) && file.endsWith('.js'))
  ) {
    throw new Error(`Missing semantic runtime chunk: ${prefix}*.js`);
  }
}

const emitted = walk(distDir);
if (emitted.length > 30) {
  throw new Error(
    `Runtime build emitted ${emitted.length} JavaScript files; expected at most 30.`,
  );
}

for (const file of emitted) {
  if (readFileSync(file, 'utf8').includes('.d.ts')) {
    throw new Error(`Runtime file references a declaration artifact: ${file}`);
  }
}

console.log(
  `Built entrypoint check passed — ${entries.length} entries loaded from ` +
    `${emitted.length} JavaScript files.`,
);
