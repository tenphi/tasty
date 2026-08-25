#!/usr/bin/env node
/**
 * Assert that test-only code stays out of the published build.
 *
 * `color-math.ts` keeps the reverse direction of two conversions the engine
 * never calls — sRGB to OKHSL, and lightness to OKHST tone. They exist so the
 * forward conversions, which the `okhsl()` / `okhst()` plugins do use, can be
 * round-tripped in tests. A round trip checks its own accuracy; hand-written
 * fixtures would only restate whatever the implementation currently produces.
 *
 * Nothing re-exports them from a package entry point, so the build drops them.
 * This check keeps it that way: reach one from production code and its
 * declaration reappears in `dist`, and this fails.
 *
 * `knip` cannot cover this — `knip.json` lists test files as entry points, so
 * anything a test imports reads as used.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Symbols that may exist for tests but must never reach the build. Private
 * helpers are listed alongside the exports that reach them, so a leak through
 * any of them is caught rather than only through the entry point.
 */
const TEST_ONLY = [
  // sRGB -> OKHSL (reverse of okhslToSrgb, which the okhsl() plugin uses)
  'srgbToOkhsl',
  'srgbToLinear',
  'linearSrgbToOklab',
  'oklabToOkhsl',
  // lightness -> OKHST tone (reverse of fromTone, which okhstToSrgb uses)
  'toTone',
  'lToY',
  'toneFromY',
];

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, ext, out);
    else if (path.endsWith(ext)) out.push(path);
  }
  return out;
}

/**
 * Match a declaration or a call, never prose. `srgbToOkhsl(` and
 * `srgbToOkhsl =` match; a `{@link srgbToOkhsl}` in a doc comment does not, so
 * `dist` does not need its comments stripped to be searched safely.
 */
const useOf = (name) => new RegExp(`\\b${name}\\s*[(=]`);

const failures = [];

// The registry goes stale silently if a symbol is renamed or removed — then
// this check would pass forever while testing nothing. Require each one to
// still be declared in the source.
const sources = walk('src', '.ts')
  .filter((p) => !p.includes('.test.'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

for (const name of TEST_ONLY) {
  const declared = new RegExp(
    `(?:function|const|let)\\s+${name}\\b`,
  ).test(sources);
  if (!declared) {
    failures.push(
      `${name} is in the test-only registry but is not declared in src/. ` +
        `Remove it from scripts/check-test-only-code.mjs, or fix the name.`,
    );
  }
}

// The check itself: none of them may appear in an emitted file.
const emitted = walk('dist', '.js');
if (emitted.length === 0) {
  console.error('No .js files under dist/ — run `pnpm build` first.');
  process.exit(1);
}

for (const file of emitted) {
  const code = readFileSync(file, 'utf8');
  for (const name of TEST_ONLY) {
    if (useOf(name).test(code)) {
      failures.push(
        `${name} reached the build (${file}). It is test-only: something in ` +
          `production code now references it, directly or through a re-export.`,
      );
    }
  }
}

if (failures.length) {
  console.error('Test-only code check failed:\n');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `Test-only code check passed — ${TEST_ONLY.length} symbols absent from ` +
    `${emitted.length} emitted files.`,
);
