import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Focused browser benchmarks measure production code paths. Keeping them in a
 * separate project avoids changing the development build used by browser tests
 * and by the broader comparative component benchmarks.
 */
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  test: {
    globals: true,
    benchmark: {
      include: ['src/tasty-injection.bench.ts', 'src/tasty-overhead.bench.tsx'],
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      screenshotFailures: false,
      viewport: { width: 1280, height: 800 },
      instances: [{ browser: 'chromium' }],
    },
  },
});
