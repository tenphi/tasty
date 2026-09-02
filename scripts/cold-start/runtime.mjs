/**
 * The built library, configured exactly once for this process.
 *
 * The server-rendered control and the precompiled catalog are produced by the
 * same Node process from the same `dist/`, and both need the fixtures' tokens
 * in place before they render anything. Configuring twice would warn (tokens
 * cannot change after styles are generated) and, worse, a catalog compiled
 * under a different configuration than the page is refused at registration —
 * which is exactly what the fingerprint is for.
 */
import { TOKENS } from './fixtures.mjs';

let loaded;

export function loadConfiguredRuntime() {
  loaded ??= (async () => {
    const runtime = await import('../../dist/index.js');
    runtime.configure({ tokens: TOKENS });

    return runtime;
  })();

  return loaded;
}
