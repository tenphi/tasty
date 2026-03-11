import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'static/index': 'src/static/index.ts',
    'zero/index': 'src/zero/index.ts',
    'zero/babel': 'src/zero/babel.ts',
    'zero/next': 'src/zero/next.ts',
    'core/index': 'src/core/index.ts',
    'ssr/index': 'src/ssr/index.ts',
    'ssr/next': 'src/ssr/next.ts',
    'ssr/astro': 'src/ssr/astro.ts',
  },
  format: 'esm',
  outDir: 'dist',
  unbundle: true,
  dts: true,
  external: ['fs', 'path', 'crypto', 'module', 'url', 'node:async_hooks', 'next/navigation'],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  clean: true,
});
