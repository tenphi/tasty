import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'static/index': 'src/static/index.ts',
    'zero/index': 'src/zero/index.ts',
    'zero/babel': 'src/zero/babel.ts',
    'zero/next': 'src/zero/next.ts',
    'parser/index': 'src/parser/index.ts',
  },
  format: 'esm',
  outDir: 'dist',
  unbundle: true,
  dts: true,
  external: ['fs', 'path', 'crypto'],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  clean: true,
});
