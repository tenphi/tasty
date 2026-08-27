import { playwright } from '@vitest/browser-playwright';
import { defaultExclude, defineConfig } from 'vitest/config';

/**
 * Suites that need a **real CSS engine**.
 *
 * Tasty compiles to CSS, so anything that observes the CSSOM — `insertRule`
 * acceptance, `cssText` round-tripping, `@property` / `@function` /
 * `@keyframes` support, `adoptedStyleSheets`, computed styles, the cascade —
 * can only be verified against a browser. jsdom and happy-dom reject or
 * silently mangle most modern at-rules, which used to force these suites to
 * assert on injected text instead of on what the engine actually accepted.
 *
 * Everything not listed here runs in plain Node: the parser, style handlers,
 * the pipeline, SSR string output, and the Babel extractor are pure logic and
 * pay no DOM startup cost.
 *
 * Rule of thumb for new tests: if it touches `document`, renders React, or
 * asserts on CSS the browser parsed, add it here. A DOM test left in the Node
 * project fails loudly with `document is not defined` rather than silently
 * passing.
 */
const BROWSER_TESTS = [
  // Every React-rendering suite (all `.test.tsx` files).
  'src/**/*.test.tsx',
  // Runtime CSS injection: sheet management, GC, ref counting, at-rules.
  'src/injector/**/*.test.ts',
  // Style-injecting hooks (useKeyframes, useGlobalStyles, …).
  'src/hooks/**/*.test.ts',
  // CSS @function support and its polyfill.
  'src/functions/**/*.test.ts',
  // At-rule injection.
  'src/counter-style/counter-style.test.ts',
  'src/font-face/font-face.test.ts',
  'src/keyframes/keyframes.test.ts',
  // Engine-observed style output.
  'src/chunks/chunk-predefined-states.test.ts',
  'src/compute-styles.test.ts',
  'src/config.test.ts',
  'src/rsc-cache.test.ts',
  'src/static/inject.test.ts',
  // SSR hydration reads styles back out of the document.
  'src/ssr/ssr.test.ts',
];

/**
 * Benchmarks are split along the same line, but run them one project at a time
 * — `pnpm bench` and `pnpm bench:browser`. A bare `vitest bench` runs both
 * concurrently, and the browser competing for CPU depresses the Node pipeline
 * numbers. The focused production-browser benchmarks use a separate config so
 * they can load production React without changing the browser test environment.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...defaultExclude, ...BROWSER_TESTS],
          benchmark: {
            include: ['src/**/*.bench.{ts,tsx}'],
            exclude: [
              ...defaultExclude,
              'src/tasty.bench.tsx',
              'src/tasty-injection.bench.ts',
              'src/tasty-overhead.bench.tsx',
            ],
          },
        },
      },
      {
        test: {
          name: 'browser',
          globals: true,
          include: BROWSER_TESTS,
          setupFiles: ['src/test/setup-browser.ts'],
          benchmark: {
            include: ['src/tasty.bench.tsx'],
          },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Failure screenshots are noise for a CSS library: the assertion
            // message already carries the CSS text.
            screenshotFailures: false,
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
