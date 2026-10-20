/**
 * Loads a Tasty config file (`tasty.config.ts` and friends) through `jiti`.
 *
 * `jiti` is an optional peer dependency, needed only for `configFile`. It is
 * resolved on first use rather than imported, so the Babel plugin and the
 * Next.js wrappers load without it when the config is passed in directly.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';

import type { createJiti as createJitiType } from 'jiti';

const packageRequire = createRequire(import.meta.url);

let createJiti: typeof createJitiType | undefined;

function loadJiti(): typeof createJitiType {
  if (createJiti) return createJiti;

  let jitiPath: string;
  try {
    jitiPath = packageRequire.resolve('jiti');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      throw new Error(
        '[Tasty] `configFile` requires the optional `jiti` package. Install `jiti` or pass the imported config through `config` instead.',
        { cause: error },
      );
    }
    throw error;
  }

  createJiti = (
    packageRequire(jitiPath) as { createJiti: typeof createJitiType }
  ).createJiti;
  return createJiti;
}

/**
 * Load `file` fresh (no module cache) and return its default export, or the
 * module itself when it has none. Relative imports inside the file resolve
 * from `baseDir`, which defaults to the file's own directory.
 */
export function loadConfigFile<T>(
  file: string,
  baseDir: string = path.dirname(file),
): T {
  const jiti = loadJiti()(baseDir, { moduleCache: false });
  const loaded = jiti(file) as T | { default: T };

  // jiti returns the ESM namespace, so unwrap `default` when present.
  return loaded && typeof loaded === 'object' && 'default' in loaded
    ? (loaded.default as T)
    : (loaded as T);
}
