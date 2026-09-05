#!/usr/bin/env node
/**
 * Smoke-test the emitted package graph rather than the source graph.
 *
 * Manual chunking can turn a harmless source-level cycle into an ESM temporal
 * dead zone. Unit tests import source modules, so only loading the built entry
 * points catches that class of packaging failure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
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
  'build-config-',
  'config-engine-',
  'css-definitions-',
  'debug-',
  'dsl-',
  'hydration-',
  'react-runtime-',
  'runtime-engine-',
  'runtime-state-',
  'shared-utils-',
  'style-engine-',
  'zero-engine-',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.js')) out.push(path);
  }
  return out;
}

function collectLocalGraph(entry) {
  const seen = new Set();

  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /^(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gm,
    )) {
      if (match[1].startsWith('.')) {
        visit(join(dirname(file), match[1]));
      }
    }
  }

  visit(join(distDir, entry));
  return [...seen];
}

function assertGraphExcludes(entry, forbiddenPrefixes) {
  const graph = collectLocalGraph(entry);
  const forbidden = graph.find((file) =>
    forbiddenPrefixes.some((prefix) => basename(file).startsWith(prefix)),
  );

  if (forbidden) {
    throw new Error(
      `${entry} unexpectedly loads ${basename(forbidden)}; keep its module graph isolated.`,
    );
  }
}

function assertGraphSizeAtMost(entry, maxBytes) {
  const bytes = collectLocalGraph(entry).reduce(
    (total, file) => total + statSync(file).size,
    0,
  );

  if (bytes > maxBytes) {
    throw new Error(
      `${entry} loads ${bytes} bytes of local JavaScript; expected at most ${maxBytes}.`,
    );
  }
}

function assertGraphOnlyLoads(entry, allowedPrefixes) {
  const graph = collectLocalGraph(entry);
  const unexpected = graph.find((file) => {
    if (file === join(distDir, entry)) return false;
    return !allowedPrefixes.some((prefix) => basename(file).startsWith(prefix));
  });

  if (unexpected) {
    throw new Error(
      `${entry} unexpectedly loads ${basename(unexpected)}; expected only ` +
        `${allowedPrefixes.join(', ')} chunks.`,
    );
  }
}

for (const entry of entries) {
  await import(new URL(`../dist/${entry}`, import.meta.url));
}

assertGraphExcludes('static/index.js', [
  'debug-',
  'dsl-',
  'react-runtime-',
  'runtime-engine-',
  'runtime-state-',
  'style-engine-',
]);
assertGraphExcludes('zero/index.js', [
  'debug-',
  'react-runtime-',
  'runtime-engine-',
  'runtime-state-',
]);
assertGraphExcludes('zero/babel.js', [
  'debug-',
  'react-runtime-',
  'runtime-engine-',
  'runtime-state-',
]);
assertGraphExcludes('ssr/next-config.js', [
  'collector-',
  'debug-',
  'hydration-',
  'react-runtime-',
  'runtime-engine-',
  'runtime-state-',
  'zero-engine-',
]);
assertGraphExcludes('ssr/index.js', [
  'debug-',
  'react-runtime-',
  'runtime-engine-',
  'zero-engine-',
]);
assertGraphExcludes('ssr/astro.js', [
  'debug-',
  'hydration-',
  'react-runtime-',
  'runtime-engine-',
  'zero-engine-',
]);
assertGraphExcludes('core/index.js', ['react-runtime-']);
assertGraphSizeAtMost('index.js', 559_600);
assertGraphSizeAtMost('core/index.js', 522_650);
assertGraphSizeAtMost('ssr/index.js', 375_350);
assertGraphSizeAtMost('ssr/astro.js', 389_750);
assertGraphOnlyLoads('ssr/astro-client.js', ['hydration-']);

const chunkFiles = readdirSync(join(distDir, 'chunks'));
for (const prefix of expectedChunks) {
  if (
    !chunkFiles.some((file) => file.startsWith(prefix) && file.endsWith('.js'))
  ) {
    throw new Error(`Missing semantic runtime chunk: ${prefix}*.js`);
  }
}

const emitted = walk(distDir);
if (emitted.length > 31) {
  throw new Error(
    `Runtime build emitted ${emitted.length} JavaScript files; expected at most 31.`,
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
