import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/vitest-setup.ts'],
    benchmark: {
      include: ['src/**/*.bench.{ts,tsx}'],
    },
  },
});
