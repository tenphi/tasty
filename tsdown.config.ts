import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const isSourceModule = (id: string, pattern: RegExp): boolean =>
  /[\\/]src[\\/]/.test(id) &&
  !/\.d\.[cm]?ts(?:$|\?)/.test(id) &&
  pattern.test(id);

const sharedConfig = {
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
    'ssr/next-config': 'src/ssr/next-config.ts',
    'ssr/astro': 'src/ssr/astro.ts',
    'ssr/astro-middleware': 'src/ssr/astro-middleware.ts',
    'ssr/astro-middleware-static': 'src/ssr/astro-middleware-static.ts',
    'ssr/astro-middleware-extract': 'src/ssr/astro-middleware-extract.ts',
    'ssr/astro-middleware-extract-static':
      'src/ssr/astro-middleware-extract-static.ts',
    'ssr/astro-client': 'src/ssr/astro-client.ts',
  },
  format: 'esm',
  outDir: 'dist',
  external: [
    'fs',
    'path',
    'crypto',
    'module',
    'url',
    'node:async_hooks',
    'node:crypto',
    'node:fs',
    'node:fs/promises',
    'node:module',
    'node:path',
    'node:url',
    'next/navigation',
  ],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
} satisfies UserConfig;

export default defineConfig([
  {
    ...sharedConfig,
    name: 'runtime',
    dts: false,
    clean: true,
    inputOptions: {
      preserveEntrySignatures: 'allow-extension',
    },
    outputOptions: {
      chunkFileNames: 'chunks/[name]-[hash].js',
      codeSplitting: {
        // Keep the published build compact while preserving meaningful
        // tree-shaking boundaries for consumers that import a narrow API.
        includeDependenciesRecursively: false,
        groups: [
          {
            name: 'debug',
            test: (id) => isSourceModule(id, /[\\/]debug\.ts$/),
            priority: 100,
          },
          {
            name: 'react-runtime',
            test: (id) =>
              isSourceModule(
                id,
                /[\\/](?:tasty\.tsx|batch-provider\.tsx|hooks[\\/].+|rsc-cache\.ts|compute-styles\.ts|ssr[\\/](?:collect-auto-properties|context)\.ts|utils[\\/](?:filter-base-props|get-display-name|has-keys|is-valid-element-type|mod-attrs|process-tokens)\.ts)$/,
              ),
            priority: 90,
          },
          {
            name: 'shared-utils',
            test: (id) =>
              isSourceModule(
                id,
                /[\\/]utils[\\/](?:is-dev-env|is-selector|merge-styles|warnings)\.ts$/,
              ),
            priority: 85,
          },
          {
            name: 'dsl',
            test: (id) =>
              isSourceModule(
                id,
                /[\\/](?:parser[\\/].+|plugins[\\/].+|utils[\\/](?:color-math|color-space|colors|dotize|function-color|string|styles)\.ts)$/,
              ),
            priority: 80,
          },
          {
            name: 'style-engine',
            test: (id) =>
              isSourceModule(
                id,
                /[\\/](?:config-state\.ts|(?:styles|chunks|pipeline|states)[\\/].+|utils[\\/](?:case-converter|selector-transform)\.ts)$/,
              ),
            priority: 70,
          },
          {
            name: 'runtime-engine',
            test: (id) =>
              isSourceModule(
                id,
                /[\\/](?:config\.ts|prop-handlers\.ts|(?:injector|keyframes|properties|functions|font-face|counter-style)[\\/].+|ssr[\\/](?:format-global-rules|format-keyframes|format-property|format-rules|ssr-collector-ref)\.ts|utils[\\/](?:cache-wrapper|client-state|deps-equal|hash|name-prefix|resolve-recipes|typography)\.ts)$/,
              ),
            priority: 60,
          },
        ],
      },
    },
  },
  {
    ...sharedConfig,
    name: 'declarations',
    dts: { emitDtsOnly: true },
    clean: false,
  },
]);
