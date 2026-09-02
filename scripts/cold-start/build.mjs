/**
 * Build the benchmark's page assets: the app entries, Tasty, and React.
 *
 * Everything is bundled and minified the way an application ships it, because
 * the raw `dist/` is unminified and split across a dozen files — measuring that
 * would report a build artifact nobody serves.
 */
import { build } from 'esbuild';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

// `fileURLToPath`, not `.pathname`: the latter keeps percent-encoding, so a
// checkout under a path with a space produces specifiers nothing can resolve.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const OUT = `${ROOT}.bench-cold-start/`;

export const MODES = ['baseline', 'runtime', 'prewarm'];

const MINIFY = {
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  logLevel: 'error',
  absWorkingDir: ROOT,
  define: { 'process.env.NODE_ENV': '"production"' },
};

export async function buildAssets({ components }) {
  try {
    await access(`${ROOT}dist/index.js`);
  } catch {
    throw new Error(
      'The cold-start benchmark measures the built library, and dist/ is ' +
        'missing or stale. Run `pnpm build` first.',
    );
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // React and ReactDOM as one module: react-dom is CJS and requires the very
  // same React instance, and Tasty's own `react` imports must resolve to it.
  await writeFile(
    `${OUT}react.src.js`,
    [
      "import * as NS from 'react';",
      'const R = NS.default ?? NS;',
      'export const createContext = R.createContext;',
      'export const Fragment = R.Fragment;',
      'export const createElement = R.createElement;',
      'export const forwardRef = R.forwardRef;',
      'export const useContext = R.useContext;',
      'export const useInsertionEffect = R.useInsertionEffect;',
      'export const cache = R.cache;',
      "export { createRoot } from 'react-dom/client';",
      "export { flushSync } from 'react-dom';",
    ].join('\n'),
  );
  // Both bundles are bracketed by marks. Last-byte to `eval-start` is the
  // window in which the browser compiles the graph; `eval-start` to `eval-end`
  // is that module's own top-level execution. Neither can be recovered after
  // the fact, so they are emitted into the artifacts themselves.
  await build({
    ...MINIFY,
    entryPoints: [`${OUT}react.src.js`],
    outfile: `${OUT}react.js`,
    banner: { js: 'performance.mark("react:eval-start");' },
    footer: { js: 'performance.mark("react:eval-end");' },
  });

  // Only what the page imports, so the bundle is tree-shaken the way an
  // application's would be. Re-exporting the whole library instead would add
  // ~4 KB brotli of code no page here calls and inflate the transfer column,
  // which is the column that dominates the result.
  await writeFile(
    `${OUT}tasty.src.js`,
    `export { tasty, configure, computeStyles, tastyDebug } from '${ROOT}dist/index.js';\n`,
  );
  await build({
    ...MINIFY,
    entryPoints: [`${OUT}tasty.src.js`],
    outfile: `${OUT}tasty.js`,
    external: ['react', 'react-dom', 'react-dom/client'],
    banner: { js: 'performance.mark("tasty:eval-start");' },
    footer: { js: 'performance.mark("tasty:eval-end");' },
  });

  // One entry per mode, written verbatim rather than bundled: each is a few
  // lines, and each must import Tasty as a separate resource so the benchmark
  // can time it on its own. Separate files rather than one branching entry
  // because the import must be STATIC — a dynamic `import()` would fetch Tasty
  // only after React had evaluated, which is not how a page loads and leaves
  // the shared compile window unmeasurable.
  for (const mode of MODES) {
    await writeFile(`${OUT}app-${mode}.js`, appSource(components, mode));
  }

  const sizes = {};
  for (const [label, name] of [
    ['react.js', 'react.js'],
    ['tasty.js', 'tasty.js'],
    ['app.js', 'app-runtime.js'],
  ]) {
    const code = await readFile(OUT + name);
    sizes[label] = {
      raw: code.length,
      gzip: gzipSync(code).length,
      brotli: brotliCompressSync(code).length,
    };
  }
  return sizes;
}

function appSource(components, mode) {
  const isBaseline = mode === 'baseline';
  const L = [];

  L.push("import { createElement, Fragment } from 'react';");
  L.push("import { createRoot, flushSync } from 'react-dom/client';");
  if (isBaseline) {
    L.push("import classNames from '/baseline.js';");
  } else {
    L.push("import { stylesFor, TOKENS } from '/fixtures.js';");
    L.push("import * as T from '/tasty.js';");
  }
  L.push('');
  L.push("performance.mark('modules:ready');");
  L.push('');
  L.push(`const COUNT = ${components};`);
  L.push('');

  if (!isBaseline) {
    L.push(
      "// devMode turns on the injector's hit/miss counters, the only way the",
    );
    L.push(
      '// untimed correctness pass can see whether the page generated its CSS at',
    );
    L.push(
      '// runtime. It is kept off the measured runs — it costs bookkeeping on',
    );
    L.push('// every lookup.');
    L.push("performance.mark('configure:start');");
    L.push('T.configure({');
    L.push('  tokens: TOKENS,');
    L.push("  devMode: new URLSearchParams(location.search).has('dev'),");
    L.push('});');
    L.push("performance.mark('configure:end');");
    L.push('');
  }

  L.push('function build() {');
  if (isBaseline) {
    L.push(
      "  return classNames.map((c) => () => createElement('div', { className: c }, 'x'));",
    );
  } else {
    if (mode === 'prewarm') {
      // One throwaway style computation against a detached root: it compiles
      // the parser, the pipeline and the style handlers without touching the
      // document, so the first real render pays only for its own CSS.
      L.push("  performance.mark('prewarm:start');");
      L.push('  T.computeStyles(');
      L.push(
        "    { display: 'flex', fill: '#purple', padding: '2x', color: '#white', radius: '1r', border: '1bw solid #dark' },",
      );
      L.push(
        "    { root: document.createElement('div').attachShadow({ mode: 'open' }) },",
      );
      L.push('  );');
      L.push("  performance.mark('prewarm:end');");
    }
    L.push('  return stylesFor(COUNT).map((styles) => {');
    L.push('    const C = T.tasty({ styles });');
    L.push("    return () => createElement(C, null, 'x');");
    L.push('  });');
  }
  L.push('}');
  L.push('');
  L.push('const items = build();');
  L.push("const root = createRoot(document.getElementById('root'));");
  L.push('');
  L.push(
    '// The first component alone: this is where Tasty compiles its deferred',
  );
  L.push('// payload, and it is not representative of the ones after it.');
  L.push("performance.mark('render-first:start');");
  L.push('flushSync(() => root.render(items[0]()));');
  L.push("performance.mark('render-first:end');");
  L.push('');
  L.push("performance.mark('render-rest:start');");
  L.push('flushSync(() =>');
  L.push('  root.render(');
  L.push('    createElement(');
  L.push('      Fragment,');
  L.push('      null,');
  L.push(
    '      ...items.map((make, i) => createElement(Fragment, { key: i }, make())),',
  );
  L.push('    ),');
  L.push('  ),');
  L.push(');');
  L.push("performance.mark('render-rest:end');");
  L.push('');
  // The run ends at the first contentful paint, not two animation frames
  // later: rAF fires BEFORE paint, so a page that commits fast can reach its
  // second frame with nothing painted yet and no paint entry to read. A
  // render-blocking stylesheet (the control has one, the runtime modes do not)
  // is exactly the case where that happens.
  L.push('function finish() {');
  L.push('  const first = document.querySelector("#root > *");');
  L.push('  window.__benchProof = {');
  L.push('    rendered: document.querySelectorAll("#root > *").length,');
  L.push(
    '    background: first ? getComputedStyle(first).backgroundColor : null,',
  );
  L.push('  };');
  L.push(
    isBaseline
      ? '  window.__benchMetrics = null;'
      : '  window.__benchMetrics = T.tastyDebug.summary({ raw: true }).metrics ?? null;',
  );
  L.push('  window.__benchDone = true;');
  L.push('}');
  L.push('');
  L.push('const paintObserver = new PerformanceObserver((list, observer) => {');
  L.push(
    "  if (!list.getEntriesByName('first-contentful-paint').length) return;",
  );
  L.push('  observer.disconnect();');
  L.push('  clearTimeout(noPaintTimer);');
  L.push('  finish();');
  L.push('});');
  L.push('');
  L.push('// Fail in seconds rather than hanging until the harness times out.');
  L.push('const noPaintTimer = setTimeout(() => {');
  L.push('  paintObserver.disconnect();');
  L.push('  window.__benchNoPaint = true;');
  L.push('  finish();');
  L.push('}, 15_000);');
  L.push('');
  L.push("paintObserver.observe({ type: 'paint', buffered: true });");

  return L.join('\n') + '\n';
}
