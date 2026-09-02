#!/usr/bin/env node
/**
 * Page-load cold start for Tasty in a real browser.
 *
 * The other benchmarks in this repo are microbenchmarks that deliberately
 * exclude the network, module compilation and the first render. This one
 * measures exactly those: what a visitor waits for between requesting a page
 * and seeing styled content, split into the parts a change can actually move.
 *
 *   pnpm bench:cold-start
 *   pnpm bench:cold-start -- --network slow-4g --cpu 4 --runs 7
 *   pnpm bench:cold-start -- --mode baseline,runtime --components 50
 *
 * Modes:
 *   baseline — the same components server-rendered: identical markup, a linked
 *              stylesheet, and no Tasty on the page. Every other column should
 *              be read as a delta against this one.
 *   runtime  — Tasty generates the CSS in the browser, as a client-rendered
 *              application does.
 *   prewarm  — the same, after one throwaway `computeStyles` against a
 *              detached root, which pays the library's one-time compile cost
 *              before the first component renders.
 */
import { createServer } from 'node:http';
import { copyFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import { buildAssets, OUT } from './build.mjs';
import { buildBaseline } from './baseline.mjs';
import { CPU_RATES, NETWORK_PROFILES } from './network.mjs';

const args = parseArgs(process.argv.slice(2));
const RUNS = args.runs ?? 5;
const COMPONENTS = args.components ?? 50;
const MODES = (args.mode ?? 'baseline,runtime,prewarm').split(',');
const NETWORKS = (args.network ?? 'none,fast-4g,slow-4g').split(',');
const CPUS = args.cpu ? args.cpu.split(',').map(Number) : CPU_RATES;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
  }
  if (out.runs) out.runs = Number(out.runs);
  if (out.components) out.components = Number(out.components);
  return out;
}

/**
 * Only `baseline` links a stylesheet, because it is the only page whose CSS is
 * a static asset. The runtime modes have no stylesheet at all until Tasty
 * injects one.
 */
const page = (mode) => `<!doctype html>
<meta charset="utf-8">
<title>Tasty cold start</title>
<script type="importmap">{"imports":{"react":"/react.js","react-dom/client":"/react.js","react-dom":"/react.js"}}</script>
${mode === 'baseline' ? '<link rel="stylesheet" href="/baseline.css">' : ''}
<div id="root"></div>
<script type="module" src="/app-${mode}.js"></script>
`;

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/') {
        const mode =
          new URL(req.url, 'http://x').searchParams.get('mode') ?? 'runtime';
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        return res.end(page(mode));
      }
      try {
        const body = await readFile(OUT + path.replace(/^\//, ''));
        res.writeHead(200, {
          'content-type': path.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
          // No caching: every run is a first visit, which is the case that hurts.
          'cache-control': 'no-store',
        });
        res.end(body);
      } catch {
        res.writeHead(404).end('');
      }
    } catch (error) {
      console.error('[bench server]', error);
      res.writeHead(500).end('');
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/** One page load, in a throwaway context so no cache of any kind carries over. */
async function measure(browser, base, { mode, network, cpu }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const profile = NETWORK_PROFILES[network];
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: profile ? profile.download : -1,
    uploadThroughput: profile ? profile.upload : -1,
    latency: profile ? profile.latency : 0,
  });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  await page.goto(`${base}/?mode=${mode}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__benchDone === true, null, {
    timeout: 120_000,
  });

  // Retained heap, not peak: collect first, so what is left is what the page
  // still holds. The control column makes the number meaningful — on its own,
  // most of it is React and the DOM.
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');

  const raw = await page.evaluate(() => {
    const mark = (n) => performance.getEntriesByName(n)[0]?.startTime ?? null;
    const res = (suffix) =>
      performance
        .getEntriesByType('resource')
        .find((e) => e.name.endsWith(suffix)) ?? null;
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance
      .getEntriesByType('paint')
      .find((e) => e.name === 'first-contentful-paint');
    const tasty = res('/tasty.js');
    const react = res('/react.js');
    const app =
      performance
        .getEntriesByType('resource')
        .find((e) => /\/app-[a-z]+\.js$/.test(e.name)) ?? null;
    const css = res('/baseline.css');
    return {
      navResponseEnd: nav?.responseEnd ?? 0,
      tasty: tasty && {
        start: tasty.startTime,
        end: tasty.responseEnd,
        bytes: tasty.encodedBodySize,
      },
      react: react && {
        start: react.startTime,
        end: react.responseEnd,
        bytes: react.encodedBodySize,
      },
      app: app && {
        start: app.startTime,
        end: app.responseEnd,
        bytes: app.encodedBodySize,
      },
      evalStart: mark('tasty:eval-start'),
      evalEnd: mark('tasty:eval-end'),
      reactEvalStart: mark('react:eval-start'),
      reactEvalEnd: mark('react:eval-end'),
      css: css && { start: css.startTime, end: css.responseEnd },
      modulesReady: mark('modules:ready'),
      configure: [mark('configure:start'), mark('configure:end')],
      prewarm: [mark('prewarm:start'), mark('prewarm:end')],
      renderFirst: [mark('render-first:start'), mark('render-first:end')],
      renderRest: [mark('render-rest:start'), mark('render-rest:end')],
      fcp: fcp?.startTime ?? null,
      noPaint: window.__benchNoPaint === true,
    };
  });

  await context.close();
  if (raw.noPaint) {
    throw new Error(
      `${mode} mode never painted, so its timings end at an arbitrary timeout.`,
    );
  }
  return { ...raw, heap: usedSize };
}

/**
 * Prove each mode is doing what its label says, before any of its numbers are
 * reported. Runs untimed, on its own page load, with devMode on.
 *
 * Two things have to hold. The runtime modes must actually generate their CSS
 * in the browser — a page that quietly served it some other way would report
 * the wrong path under the runtime label. And every mode must produce the same
 * pixels: the control is only a control if it renders what the runtime renders,
 * which the class names alone do not prove.
 */
async function verifyModes(browser, base, modes) {
  const results = {};
  for (const mode of modes) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/?mode=${mode}&dev=1`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__benchDone === true, null, {
      timeout: 120_000,
    });
    const state = await page.evaluate(() => ({
      metrics: window.__benchMetrics,
      proof: window.__benchProof,
      noPaint: window.__benchNoPaint === true,
    }));
    await context.close();

    const generated = state.metrics?.misses ?? 0;
    results[mode] = { generated, ...state.proof };

    if (state.noPaint) {
      throw new Error(`${mode} mode never painted.`);
    }
    if (state.proof?.rendered !== COMPONENTS) {
      throw new Error(
        `${mode} mode rendered ${state.proof?.rendered} of ${COMPONENTS} components.`,
      );
    }
    if (mode !== 'baseline' && generated === 0) {
      throw new Error(
        `${mode} mode generated no CSS at runtime, so its numbers are not the runtime path.`,
      );
    }
  }

  // An unstyled div computes `rgba(0, 0, 0, 0)`, so equality alone would pass
  // on a page whose CSS never applied. Both halves have to be checked.
  const backgrounds = new Set(Object.values(results).map((r) => r.background));
  if (backgrounds.size > 1) {
    throw new Error(
      'Modes do not render the same pixels: ' +
        Object.entries(results)
          .map(([m, r]) => `${m} ${r.background}`)
          .join(', '),
    );
  }
  const [background] = backgrounds;
  if (!background || background === 'rgba(0, 0, 0, 0)') {
    throw new Error(
      `Every mode rendered an unstyled component (${background}); no CSS applied.`,
    );
  }

  return { results, background };
}

const span = ([a, b]) => (a == null || b == null ? null : b - a);
const median = (xs) => {
  const v = xs.filter((n) => n != null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const fmt = (n) =>
  n == null ? '—' : n < 10 ? n.toFixed(1) : String(Math.round(n));

function phases(r) {
  const lastByte = Math.max(
    r.tasty?.end ?? 0,
    r.react?.end ?? 0,
    r.app?.end ?? 0,
    r.css?.end ?? 0,
  );
  return {
    html: r.navResponseEnd,
    'js+css transfer': lastByte - (r.react?.start ?? r.app?.start ?? 0),
    // The browser compiles the whole module graph between the last byte and
    // the first top-level statement, so this window is shared. The control
    // column is the same window without Tasty in the graph; the difference is
    // Tasty's compile cost.
    'compile (graph)':
      r.reactEvalStart != null ? r.reactEvalStart - lastByte : null,
    'react execute': span([r.reactEvalStart, r.reactEvalEnd]),
    'tasty execute': span([r.evalStart, r.evalEnd]),
    configure: span(r.configure),
    prewarm: span(r.prewarm),
    'render 1st': span(r.renderFirst),
    [`render ${COMPONENTS - 1} more`]: span(r.renderRest),
    'FCP (abs)': r.fcp,
    'heap (KB)': r.heap / 1024,
  };
}

const { server, base } = await serve();
const sizes = await buildAssets({ components: COMPONENTS });
const baseline = await buildBaseline({ out: OUT, components: COMPONENTS });
// The page renders the same fixtures the control was server-rendered from.
await copyFile(new URL('./fixtures.mjs', import.meta.url), `${OUT}fixtures.js`);

console.log(
  `Tasty cold start — ${COMPONENTS} styled components, ${RUNS} runs per cell, uncached\n`,
);
for (const [name, s] of Object.entries(sizes)) {
  console.log(
    `  ${name.padEnd(10)} ${(s.raw / 1024).toFixed(0).padStart(4)} KB raw  ${(s.brotli / 1024).toFixed(1).padStart(5)} KB brotli`,
  );
}
console.log(
  `  baseline.css ${(baseline.cssBytes / 1024).toFixed(1).padStart(4)} KB   ${baseline.classes} classes\n`,
);

const browser = await chromium.launch();

const { results: verified, background } = await verifyModes(
  browser,
  base,
  MODES,
);
console.log(
  `mode check: all render ${COMPONENTS} components at ${background} — ` +
    Object.entries(verified)
      .map(([m, v]) => `${m} ${v.generated} rules generated`)
      .join(', ') +
    '\n',
);

for (const cpu of CPUS) {
  for (const network of NETWORKS) {
    const label = `${NETWORK_PROFILES[network]?.label ?? 'no throttling'}, CPU ${cpu}x`;
    console.log(`── ${label} ${'─'.repeat(Math.max(0, 58 - label.length))}`);
    const rows = {};
    for (const mode of MODES) {
      const runs = [];
      for (let i = 0; i < RUNS; i++)
        runs.push(phases(await measure(browser, base, { mode, network, cpu })));
      rows[mode] = Object.fromEntries(
        Object.keys(runs[0]).map((k) => [k, median(runs.map((r) => r[k]))]),
      );
    }

    const keys = Object.keys(rows[MODES[0]]);
    console.log(
      '  ' + 'phase'.padEnd(20) + MODES.map((m) => m.padStart(14)).join(''),
    );
    for (const k of keys) {
      const unit = k.includes('KB') ? '' : ' ms';
      const cells = MODES.map((m) => `${fmt(rows[m][k])}${unit}`.padStart(14));
      if (cells.every((c) => c.trim().replace(unit.trim(), '').trim() === '—'))
        continue;
      console.log('  ' + k.padEnd(20) + cells.join(''));
      if (k === 'heap (KB)' && rows.baseline) {
        const deltas = MODES.map((m) =>
          m === 'baseline' || rows[m][k] == null || rows.baseline[k] == null
            ? '—'.padStart(14)
            : `+${fmt(rows[m][k] - rows.baseline[k])}`.padStart(14),
        );
        console.log('  ' + '  vs control'.padEnd(20) + deltas.join(''));
      }
    }
    console.log('');
  }
}

await browser.close();
server.close();
