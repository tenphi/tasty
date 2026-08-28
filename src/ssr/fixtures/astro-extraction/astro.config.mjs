import { fileURLToPath, URL } from 'node:url';

import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

import { tastyIntegration } from '../../astro.ts';

export default defineConfig({
  integrations: [
    react(),
    tastyIntegration({
      islands: false,
      css: { mode: 'extract', strategy: 'shared' },
    }),
  ],
  vite: {
    resolve: {
      alias: [
        {
          find: '@tenphi/tasty/ssr/astro-middleware-extract-static',
          replacement: fileURLToPath(
            new URL('../../astro-middleware-extract-static.ts', import.meta.url),
          ),
        },
        {
          find: /^@tenphi\/tasty$/,
          replacement: fileURLToPath(
            new URL('../../../index.ts', import.meta.url),
          ),
        },
      ],
    },
  },
});
