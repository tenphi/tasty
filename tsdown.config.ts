import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'static/index': 'src/static/index.ts',
    'static/inject': 'src/static/inject.ts',
    'zero/index': 'src/zero/index.ts',
    'zero/babel': 'src/zero/babel.ts',
    'zero/next': 'src/zero/next.ts',
    'ssr/index': 'src/ssr/index.ts',
    'ssr/next': 'src/ssr/next.ts',
    'ssr/astro': 'src/ssr/astro.ts',
    'ssr/astro-middleware': 'src/ssr/astro-middleware.ts',
    'ssr/astro-middleware-static': 'src/ssr/astro-middleware-static.ts',
    'ssr/astro-middleware-extract':
      'src/ssr/astro-middleware-extract.ts',
    'ssr/astro-middleware-extract-static':
      'src/ssr/astro-middleware-extract-static.ts',
    'ssr/astro-client': 'src/ssr/astro-client.ts',
  },
  format: 'esm',
  outDir: 'dist',
  dts: true,
  external: [
    'fs',
    'path',
    'crypto',
    'module',
    'url',
    'node:async_hooks',
    'node:crypto',
    'node:fs/promises',
    'node:path',
    'node:url',
    'next/navigation',
  ],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  clean: true,
});
