/**
 * Compile the precompiled catalog for the benchmark page.
 *
 * Uses the same fixtures the page renders, so the `precompiled` mode measures
 * a catalog that genuinely covers every component. The run asserts the hit
 * count afterwards; a catalog that quietly missed would report the runtime
 * path under the precompiled label.
 *
 * Tokens come from the shared runtime loader, so this catalog is compiled
 * under exactly the configuration the page runs — a catalog compiled under a
 * different one is refused at registration, which is the point of the
 * fingerprint.
 */
import { writeFile } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { createElement } from 'react';

import { stylesFor } from './fixtures.mjs';
import { loadConfiguredRuntime } from './runtime.mjs';

export async function buildCatalog({ out, components }) {
  const { precompileTastyStyles } =
    await import('../../dist/precompile/index.js');
  const { tasty } = await loadConfiguredRuntime();

  const result = await precompileTastyStyles({
    id: '@tenphi/tasty/cold-start-benchmark',
    cases: stylesFor(components).map((styles, index) => ({
      id: `c${index}`,
      render: () => createElement(tasty({ styles })),
    })),
  });

  await writeFile(
    `${out}catalog.manifest.js`,
    `export default ${JSON.stringify(result.manifest)};\n`,
  );
  // A real stylesheet, linked from the page: that is how a catalog ships, and
  // it keeps its transfer cost visible in the resource timings.
  await writeFile(`${out}catalog.css`, result.css);

  return {
    chunks: result.manifest.chunks.length,
    cssBytes: result.css.length,
    brotliBytes: brotliCompressSync(Buffer.from(result.css)).length,
  };
}
